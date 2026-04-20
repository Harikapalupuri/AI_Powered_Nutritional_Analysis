# =============================================================================
# NutriVision - app.py  (FIXED ENSEMBLE VERSION + AUTH + CHAT)
# =============================================================================

from flask import Flask, render_template, request, jsonify
from transformers import (
    pipeline,
    AutoImageProcessor,
    SiglipForImageClassification,
)
from PIL import Image
import torch
import torch.nn.functional as F
import functools
import os
import re
import requests
import json
import base64
import io
import sqlite3
import hashlib
import secrets
from datetime import datetime, timedelta
from functools import wraps
from werkzeug.utils import secure_filename
from food_constants import (
    MODEL1_CLASSES,
    MODEL2_CLASSES,
    MODEL1_ONLY_CLASSES,
    MODEL2_ONLY_CLASSES,
    CUSTOM_ONLY_CLASSES,
    CUSTOM_EXCLUSIVE_MIN_CONF,
    FOOD101_EXCLUSIVE_MIN_CONF,
    CONSENSUS_THRESHOLD,
    MODEL2_EXCLUSIVE_MIN_CONF,
    LABEL_ALIASES,
)

app = Flask(__name__)
app.config["UPLOAD_FOLDER"] = "static/uploads"
app.config["MAX_CONTENT_LENGTH"] = 16 * 1024 * 1024
os.makedirs(app.config["UPLOAD_FOLDER"], exist_ok=True)

# ── CORS ──────────────────────────────────────────────────────────────────────
@app.after_request
def add_cors(response):
    response.headers["Access-Control-Allow-Origin"]  = "*"
    response.headers["Access-Control-Allow-Methods"] = "GET,POST,OPTIONS"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type,Authorization,X-Auth-Token"
    return response

@app.route("/", defaults={"path": ""}, methods=["OPTIONS"])
@app.route("/<path:path>", methods=["OPTIONS"])
def options_handler(path):
    return jsonify({}), 200

# ============================================================
# OPENROUTER CONFIG
# ============================================================
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY", "")  # <-- paste your full key here
OPENROUTER_URL     = "https://openrouter.ai/api/v1/chat/completions"

CANDIDATE_MODELS = [
    "openai/gpt-4o-mini",
    "mistralai/mistral-7b-instruct:free",
    "google/gemma-2-9b-it:free",
]

# ============================================================
# CUSTOM MODEL PATH (166-class SigLIP; matches Kaggle export final_food_model)
# ============================================================
CUSTOM_MODEL_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "final_food_model")

# ============================================================
# DATABASE
# ============================================================
DB_PATH = os.path.join(os.path.dirname(__file__), "nutrivision.db")

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db()
    c = conn.cursor()
    c.executescript('''
        CREATE TABLE IF NOT EXISTS users (
            id        INTEGER PRIMARY KEY AUTOINCREMENT,
            username  TEXT    UNIQUE NOT NULL,
            email     TEXT    UNIQUE NOT NULL,
            password  TEXT    NOT NULL,
            created   TEXT    NOT NULL
        );

        CREATE TABLE IF NOT EXISTS sessions (
            token     TEXT    PRIMARY KEY,
            user_id   INTEGER NOT NULL,
            expires   TEXT    NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id)
        );

        CREATE TABLE IF NOT EXISTS analyses (
            id                INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id           INTEGER NOT NULL,
            food_name         TEXT    NOT NULL,
            confidence        TEXT,
            detection_source  TEXT,
            age               TEXT,
            gender            TEXT,
            height            TEXT,
            weight            TEXT,
            bmi               REAL,
            bmi_category      TEXT,
            diet_pref         TEXT,
            condition         TEXT,
            nutrition_json    TEXT,
            health_benefits   TEXT,
            portion_advice    TEXT,
            health_context    TEXT,
            alternatives_json TEXT,
            image_path        TEXT,
            created           TEXT    NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id)
        );

        CREATE TABLE IF NOT EXISTS chat_messages (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id     INTEGER NOT NULL,
            role        TEXT    NOT NULL,
            content     TEXT    NOT NULL,
            created     TEXT    NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id)
        );

        CREATE TABLE IF NOT EXISTS user_health_context (
            user_id         INTEGER PRIMARY KEY,
            past_conditions TEXT,
            notes           TEXT,
            updated         TEXT,
            FOREIGN KEY (user_id) REFERENCES users(id)
        );
    ''')
    conn.commit()
    conn.close()
    print("[DB] SQLite database initialised ✓")

# ── Auth helpers ──────────────────────────────────────────────────────────────
def hash_password(password):
    return hashlib.sha256(password.encode()).hexdigest()

def create_session(user_id):
    token   = secrets.token_hex(32)
    expires = (datetime.utcnow() + timedelta(days=7)).isoformat()
    conn    = get_db()
    conn.execute("INSERT INTO sessions (token, user_id, expires) VALUES (?, ?, ?)",
                 (token, user_id, expires))
    conn.commit()
    conn.close()
    return token

def get_user_from_token(token):
    if not token:
        return None
    conn = get_db()
    row  = conn.execute(
        "SELECT u.* FROM sessions s JOIN users u ON s.user_id = u.id "
        "WHERE s.token = ? AND s.expires > ?",
        (token, datetime.utcnow().isoformat())
    ).fetchone()
    conn.close()
    return dict(row) if row else None

def require_auth(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        token = request.headers.get("X-Auth-Token") or request.cookies.get("nv_token")
        user  = get_user_from_token(token)
        if not user:
            return jsonify({"error": "Unauthorised"}), 401
        return f(user, *args, **kwargs)
    return decorated

def get_user_latest_condition(user_id):
    conn = get_db()
    row  = conn.execute(
        "SELECT condition FROM analyses WHERE user_id=? ORDER BY id DESC LIMIT 1",
        (user_id,)
    ).fetchone()
    conn.close()
    return row["condition"] if row else None

def get_user_past_conditions(user_id):
    conn = get_db()
    row  = conn.execute(
        "SELECT past_conditions FROM user_health_context WHERE user_id=?",
        (user_id,)
    ).fetchone()
    conn.close()
    return row["past_conditions"] if row else ""

# Food class lists and routing thresholds moved to food_constants.py

def normalize_label(label: str) -> str:
    return LABEL_ALIASES.get(label, label)


def squeeze_vocab_label(raw):
    """Lowercase, underscores→spaces, collapse whitespace — must match food_constants vocab keys."""
    if not raw:
        return None
    s = str(raw).replace("_", " ").strip().lower()
    s = " ".join(s.split())
    if not s:
        return None
    return normalize_label(s)


# ============================================================
# HEALTH WARNING RULES
# ============================================================
HEALTH_WARNING_RULES = {
    "Diabetes": {
        "keywords": [
            "cake","pastry","donut","doughnut","cookie","candy","chocolate","ice cream",
            "ice_cream","jalebi","gulab jamun","gulab_jamun","rasgulla","halwa","kheer",
            "laddu","barfi","mithai","sweet","pudding","brownie","waffle","pancake",
            "french toast","french_toast","muffin","cupcake","cheesecake","pie","tart",
            "bread pudding","bread_pudding","creme brulee","creme_brulee","tiramisu",
            "baklava","macarons","churros","beignets","frozen yogurt","frozen_yogurt",
            "panna cotta","panna_cotta","strawberry shortcake","strawberry_shortcake",
            "red velvet cake","red_velvet_cake","carrot cake","carrot_cake",
            "chocolate cake","chocolate_cake","chocolate mousse","chocolate_mousse",
            "cupcakes","cup cakes","cup_cakes","malapua","modak","bobbatlu","ariselu",
            "adhirasam","imarti","sheer korma","sheer_korma","double ka meetha",
            "double_ka_meetha","ghevar","basundi","rabri","phirni","sheera",
            "sohan halwa","sohan_halwa","shrikhand","misti doi","misti_doi",
            "sandesh","cham cham","cham_cham","ras malai","ras_malai","rasmalai",
            "lyangcha","ledikeni","pithe","chhena kheeri","chhena_kheeri","kalakand",
            "pootharekulu","chalimidi","gavvalu","kajjikaya","shankarpali","poornalu",
            "sunnundalu","chikki","dharwad pedha","dharwad_pedha","anarse",
            "bandar laddu","bandar_laddu","sohan papdi","sohan_papdi",
            "unni appam","unni_appam","sutar feni","sutar_feni","doodhpak",
            "qubani ka meetha","qubani_ka_meetha","chak hao kheer","chak_hao_kheer",
            "kuzhi paniyaram","kuzhi_paniyaram","mysore pak","mysore_pak",
            "rava laddu","rava_laddu","dry fruit laddu","dry_fruit_laddu",
            "paramannam","bellam pongali","bellam_pongali","palathalikalu",
            "lassi","milkshake","soda","cola","soft drink",
        ],
        "message": "This food appears to be high in sugar or refined carbohydrates, which can spike blood glucose levels. People with Diabetes should avoid or consume this in very limited portions. Consider a healthier alternative below.",
    },
    "Obesity": {
        "keywords": [
            "burger","hamburger","hot dog","hot_dog","french fries","french_fries",
            "fried","fry","deep fried","onion rings","onion_rings","nachos",
            "pizza","cheese","creamy","butter","fatty","ice cream","ice_cream",
            "cake","donut","doughnut","chips","mayo","mayonnaise","bacon",
            "sausage","pork","cream","mac and cheese","macaroni and cheese",
            "macaroni_and_cheese","grilled cheese","grilled_cheese",
            "pulled pork","pulled_pork","prime rib","prime_rib","pork chop","pork_chop",
            "foie gras","foie_gras","croque madame","croque_madame",
            "beef carpaccio","beef_carpaccio","beef tartare","beef_tartare",
            "club sandwich","club_sandwich","lobster bisque","lobster_bisque",
            "lobster roll","lobster_roll","crab cakes","crab_cakes",
            "eggs benedict","eggs_benedict","huevos rancheros","huevos_rancheros",
            "poutine","churros","beignets","waffles","pancake","waffle",
            "bread pudding","bread_pudding","baby back ribs","baby_back_ribs",
            "steak","biryani","butter chicken","butter_chicken",
            "dal makhani","dal_makhani","paneer butter masala","paneer_butter_masala",
            "halwa","laddu","mithai","sweet","jalebi","gulab jamun","gulab_jamun",
        ],
        "message": "This food is high in calories, fat, or refined carbohydrates. For weight management, consume rarely and in small portions. Consider a lighter, healthier alternative.",
    },
    "Hypertension": {
        "keywords": [
            "pickle","achaar","papad","chips","namkeen","processed","canned",
            "sausage","bacon","ham","deli","smoked","hot dog","hot_dog",
            "burger","pizza","fast food","soy sauce","fish sauce","ketchup",
            "french fries","french_fries","onion rings","onion_rings",
            "instant","ramen","pho","miso","clam chowder","clam_chowder",
            "lobster bisque","lobster_bisque","french onion soup","french_onion_soup",
            "hot and sour soup","hot_and_sour_soup","crab cakes","crab_cakes",
            "shrimp","prawn fry","prawn_fry","royyala iguru","royyala_iguru",
            "avakaya","mango pickle","mango_pickle","allam pachadi","allam_pachadi",
            "coriander chutney","coriander_chutney","gongura pachadi","gongura_pachadi",
            "chintakaya pachadi","chintakaya_pachadi","kobbari pachadi","kobbari_pachadi",
            "peanut chutney","peanut_chutney",
        ],
        "message": "This food may be high in sodium or salt, which can raise blood pressure. People with Hypertension should limit consumption and opt for low-sodium alternatives.",
    },
    "Heart Disease": {
        "keywords": [
            "fried","deep fried","fry","butter","ghee","cream","creamy","fatty",
            "bacon","sausage","pork","ham","salami","pepperoni",
            "burger","hamburger","hot dog","hot_dog","steak","prime rib","prime_rib",
            "pork chop","pork_chop","baby back ribs","baby_back_ribs",
            "pulled pork","pulled_pork","foie gras","foie_gras",
            "beef carpaccio","beef_carpaccio","beef tartare","beef_tartare",
            "mac and cheese","macaroni_and_cheese","grilled cheese","grilled_cheese",
            "french fries","french_fries","onion rings","onion_rings","chips",
            "pizza","nachos","poutine","croque madame","croque_madame",
            "eggs benedict","eggs_benedict","cake","pastry","donut","doughnut",
            "ice cream","ice_cream","chocolate","butter chicken","butter_chicken",
            "dal makhani","dal_makhani","halwa","laddu","gulab jamun","gulab_jamun",
        ],
        "message": "This food is high in saturated fat, trans fat, or cholesterol, which can negatively impact cardiovascular health. Choose heart-healthy alternatives instead.",
    },
    "PCOD": {
        "keywords": [
            "sugar","sweet","candy","chocolate","cake","donut","doughnut",
            "ice cream","ice_cream","jalebi","gulab jamun","gulab_jamun",
            "rasgulla","halwa","laddu","mithai","fried","deep fried",
            "refined","white bread","pasta","pizza","burger","processed",
            "soda","cola","milkshake","cream","cheesecake","waffle","pancake",
            "french toast","french_toast","maida","macarons","churros","beignets",
            "panna cotta","panna_cotta","tiramisu","baklava",
            "biryani","butter chicken","butter_chicken","dal makhani","dal_makhani",
        ],
        "message": "This food may be high in sugar, refined carbs, or dairy which can worsen hormonal imbalance. Women with PCOD should limit this and prefer low-glycemic, anti-inflammatory alternatives.",
    },
    "Arthritis": {
        "keywords": [
            "fried","deep fried","fry","bacon","sausage","processed","red meat",
            "pork","ham","burger","hot dog","hot_dog","pizza","fast food",
            "sugar","sweet","candy","cake","donut","doughnut","ice cream","ice_cream",
            "alcohol","soda","cola","refined","white bread","chips","nachos",
            "butter","ghee","cream","fatty","saturated","trans fat",
        ],
        "message": "This food may promote inflammation, which can worsen joint pain and stiffness. People with Arthritis should avoid pro-inflammatory foods and prefer anti-inflammatory options like fish, nuts, and leafy greens.",
    },
    "Hyperlipidemia": {
        "keywords": [
            "fried","deep fried","fry","butter","ghee","cream","creamy","fatty",
            "bacon","sausage","pork","ham","salami","pepperoni","lard","shortening",
            "burger","hamburger","hot dog","hot_dog","steak","prime rib","prime_rib",
            "pork chop","pork_chop","baby back ribs","baby_back_ribs",
            "pulled pork","pulled_pork","foie gras","foie_gras",
            "mac and cheese","macaroni_and_cheese","grilled cheese","grilled_cheese",
            "french fries","french_fries","onion rings","onion_rings","chips","nachos",
            "pizza","poutine","croque madame","croque_madame",
            "cake","pastry","donut","doughnut","cookie","brownie","muffin",
            "ice cream","ice_cream","cheesecake","chocolate","whipped cream",
            "butter chicken","butter_chicken","dal makhani","dal_makhani",
            "paneer butter masala","paneer_butter_masala","biryani",
            "halwa","laddu","gulab jamun","gulab_jamun","rasgulla","kheer",
            "creme brulee","creme_brulee","tiramisu","panna cotta","panna_cotta",
            "eggs benedict","eggs_benedict","lobster bisque","lobster_bisque",
            "coconut milk","coconut cream","full fat dairy",
        ],
        "message": "This food is high in saturated fat, trans fat, or cholesterol, which can raise LDL (bad) cholesterol and triglyceride levels. People with Hyperlipidemia should avoid this and choose low-fat, high-fiber alternatives.",
    },
    "Osteoporosis": {
        "keywords": [
            "alcohol","soda","cola","soft drink","energy drink","caffeine",
            "coffee","black tea","salt","sodium","pickle","achaar","papad",
            "chips","namkeen","processed","canned","fast food",
            "high sodium","soy sauce","fish sauce","instant","ramen",
            "chocolate","cocoa","oxalic acid","spinach","beet","rhubarb",
            "liver","organ meat","red meat","fatty meat","bacon","sausage",
        ],
        "message": "This food may interfere with calcium absorption or increase calcium loss from bones. People with Osteoporosis should limit caffeine, high-sodium, and high-oxalate foods, and focus on calcium and Vitamin D rich foods.",
    },
    "Chronic Kidney Disease": {
        "keywords": [
            "salt","sodium","pickle","achaar","papad","chips","namkeen","processed",
            "canned","sausage","bacon","ham","deli","smoked","fast food",
            "soy sauce","fish sauce","ketchup","instant","ramen","miso",
            "banana","orange","potato","tomato","avocado","dates","prunes",
            "nuts","peanut","almond","cashew","walnut","seeds",
            "whole grain","bran","wheat","brown rice","beans","lentil","dal",
            "kidney bean","rajma","chickpea","chana","soybean","tofu",
            "dairy","milk","cheese","curd","yogurt","paneer",
            "red meat","steak","pork","mutton","chicken","fish","seafood","shrimp","prawn",
            "dark chocolate","cocoa","coffee","cola","phosphate","protein shake",
            "supplement","creatine","high protein",
        ],
        "message": "This food may be high in potassium, phosphorus, sodium, or protein — nutrients that must be strictly limited in Chronic Kidney Disease (CKD). Please consult your nephrologist or renal dietitian.",
    },
    "Liver Disease": {
        "keywords": [
            "alcohol","beer","wine","spirits","whiskey","rum","vodka","cocktail",
            "fried","deep fried","fry","butter","ghee","cream","fatty","lard",
            "bacon","sausage","pork","ham","salami","red meat","steak",
            "burger","hamburger","hot dog","hot_dog","pizza","fast food","junk food",
            "cake","pastry","donut","doughnut","cookie","brownie","candy","sweet",
            "ice cream","ice_cream","chocolate","sugar","syrup","halwa","laddu",
            "gulab jamun","gulab_jamun","jalebi","mithai","barfi",
            "chips","nachos","processed","canned","soy sauce","fish sauce",
            "high sodium","salty snack","papad","pickle","achaar",
            "raw shellfish","raw oyster","raw clam","unpasteurized",
        ],
        "message": "This food may burden or damage the liver. People with Liver Disease should avoid alcohol, high-fat, fried, and sugary foods. Focus on lean proteins, fresh vegetables, and whole grains.",
    },
    "Hypothyroidism": {
        "keywords": [
            "soy","soybean","tofu","tempeh","soy milk","edamame","miso",
            "cabbage","broccoli","cauliflower","kale","brussels sprout",
            "bok choy","collard green","radish","turnip","mustard","mustard green",
            "millet","sweet potato","peanut","peanut butter","cassava","tapioca",
            "raw cruciferous","raw kale","raw cabbage","raw broccoli",
            "processed","fast food","refined","white bread","pasta","pizza",
            "sugar","candy","cake","donut","doughnut","cookie","soda","cola",
            "alcohol","caffeine","coffee","gluten","wheat",
        ],
        "message": "This food may contain goitrogens that interfere with thyroid hormone production. People with Hypothyroidism should limit raw cruciferous vegetables, soy-based products, and refined/sugary foods.",
    },
    "Hyperthyroidism": {
        "keywords": [
            "iodine","seaweed","kelp","nori","kombu","wakame","sea vegetable",
            "iodized salt","salty snack","chips","namkeen","seafood",
            "shellfish","shrimp","prawn","crab","lobster","fish","tuna","salmon",
            "dairy","milk","cheese","curd","yogurt","paneer",
            "egg","egg yolk","processed","canned","fast food",
            "caffeine","coffee","black tea","green tea","energy drink",
            "alcohol","sugar","candy","soda","cola","refined",
        ],
        "message": "This food may be high in iodine or stimulants that can worsen an overactive thyroid. People with Hyperthyroidism should avoid iodine-rich foods and stimulants like caffeine and alcohol.",
    },
    "Anemia": {
        "keywords": [
            "coffee","black tea","green tea","tea","caffeine",
            "dairy","milk","cheese","curd","yogurt","paneer","calcium supplement",
            "alcohol","beer","wine","spirits",
            "refined","white bread","pasta","white rice","processed",
            "soda","cola","soft drink","junk food","fast food",
            "oxalic acid","spinach raw","chocolate","cocoa","beet raw",
            "phytic acid","bran","whole wheat","raw legume","raw beans",
        ],
        "message": "This food may block iron absorption or deplete iron stores. People with Anemia should avoid tea, coffee, and calcium-rich foods alongside iron-rich meals.",
    },
    "Gout": {
        "keywords": [
            "red meat","steak","pork","lamb","mutton","beef","veal","organ meat",
            "liver","kidney","heart","brain","sweetbread","offal",
            "seafood","shellfish","shrimp","prawn","crab","lobster","anchovy",
            "sardine","mackerel","herring","tuna","scallop","mussel",
            "alcohol","beer","wine","spirits","whiskey","fructose",
            "sugar","candy","soda","cola","soft drink","fruit juice",
            "high fructose corn syrup","processed","fast food","junk food",
            "bacon","sausage","ham","deli meat","yeast","yeast extract","marmite",
            "asparagus","mushroom","cauliflower","spinach","pea","lentil","bean",
            "dal","rajma","chana","chickpea",
        ],
        "message": "This food is high in purines or fructose which can raise uric acid levels and trigger Gout attacks. Avoid red meat, organ meats, seafood, alcohol, and sugary drinks.",
    },
    "Irritable Bowel Syndrome": {
        "keywords": [
            "gluten","wheat","rye","barley","bread","pasta","pizza","noodle",
            "dairy","milk","cheese","curd","yogurt","paneer","ice cream","ice_cream",
            "lactose","cream","butter","ghee","fried","deep fried","fry","fatty",
            "spicy","chili","pepper","hot sauce","masala","curry","spice",
            "onion","garlic","leek","shallot","spring onion","scallion",
            "apple","pear","peach","mango","watermelon","cherry","fig","date",
            "cashew","pistachio","beans","lentil","dal","chickpea","chana","rajma",
            "soybean","tofu","carbonated","soda","cola","alcohol","caffeine",
            "coffee","black tea","artificial sweetener","sorbitol","mannitol",
            "xylitol","sugar free","diet soda","processed","fast food",
        ],
        "message": "This food may contain high-FODMAP ingredients, lactose, gluten, or gut irritants that can trigger IBS symptoms. Follow a low-FODMAP diet and consult a gastroenterologist.",
    },
    "Gastric Ulcer": {
        "keywords": [
            "spicy","chili","pepper","hot sauce","masala","curry","spice","cayenne",
            "acidic","citrus","lemon","lime","orange","grapefruit","tomato","vinegar",
            "alcohol","beer","wine","spirits","caffeine","coffee","black tea","energy drink",
            "fried","deep fried","fry","fatty","junk food","fast food",
            "processed","canned","sausage","bacon","ham","red meat","steak",
            "chocolate","cocoa","mint","peppermint","carbonated","soda","cola",
            "pickle","achaar","papad","chips","namkeen","salty snack",
            "raw onion","raw garlic","mustard","pepper sauce","hot chutney",
        ],
        "message": "This food is acidic, spicy, or irritating to the stomach lining. People with Gastric Ulcers should avoid spicy, acidic, fried, caffeinated, and alcoholic foods.",
    },
    "Cancer (General)": {
        "keywords": [
            "processed meat","bacon","sausage","ham","salami","pepperoni","hot dog","hot_dog",
            "deli meat","smoked","cured meat","charred","grilled meat","burnt",
            "alcohol","beer","wine","spirits","cigarette","tobacco",
            "fried","deep fried","acrylamide","french fries","french_fries","chips",
            "red meat","steak","pork","lamb","mutton","beef",
            "sugar","candy","soda","cola","soft drink","refined","white bread",
            "fast food","junk food","processed","canned","artificial additive",
            "artificial color","artificial flavor","preservative","nitrate","nitrite",
            "aflatoxin","mold","raw shellfish","raw fish","unpasteurized",
        ],
        "message": "This food has been associated with increased cancer risk. Avoid processed meats, charred foods, alcohol, and highly refined/sugary foods. Focus on a plant-rich, antioxidant diet.",
    },
    "Celiac Disease": {
        "keywords": [
            "wheat","gluten","rye","barley","semolina","maida","atta","whole wheat",
            "bread","pasta","noodle","pizza","cake","pastry","cookie","biscuit",
            "cracker","doughnut","donut","muffin","pancake","waffle","crepe",
            "flour tortilla","chapati","roti","puri","paratha","bhatura","naan",
            "daal puri","kachori","samosa","bread pudding","bread_pudding",
            "soy sauce","malt","malt vinegar","beer","ale","lager","stout",
            "seitan","bulgur","couscous","farro","spelt","kamut","triticale",
            "breaded","breadcrumb","battered","fried with flour","thickened sauce",
            "cream of wheat","malted","malted milk","wheat starch","hydrolyzed wheat protein",
        ],
        "message": "This food contains gluten which causes serious intestinal damage in people with Celiac Disease. Strictly avoid all gluten-containing foods and look for certified gluten-free alternatives.",
    },
    "Lactose Intolerance": {
        "keywords": [
            "milk","dairy","cheese","curd","yogurt","paneer","butter","ghee","cream",
            "ice cream","ice_cream","milkshake","lassi","kheer","basundi","rabri",
            "rasmalai","ras malai","ras_malai","shrikhand","doodhpak","chhena",
            "sandesh","rasgulla","gulab jamun","gulab_jamun","kalakand",
            "misti doi","misti_doi","cham cham","cham_cham","ledikeni","lyangcha",
            "whey","lactose","custard","pudding","bechamel","white sauce",
            "cream soup","creamy","au gratin","paneer butter masala","paneer_butter_masala",
            "dal makhani","dal_makhani","butter chicken","butter_chicken",
            "macaroni and cheese","mac and cheese","cheesecake","pizza","crepe",
        ],
        "message": "This food contains lactose which people with Lactose Intolerance cannot properly digest. Avoid dairy-based foods or choose lactose-free or plant-based alternatives.",
    },
}

# ============================================================
# UTILITIES
# ============================================================
def allowed_file(filename):
    return bool(filename and filename.strip())

def is_valid_image_upload(file_storage):
    try:
        file_storage.stream.seek(0)
        with Image.open(file_storage.stream) as img:
            img.verify()
        file_storage.stream.seek(0)
        return True
    except Exception:
        file_storage.stream.seek(0)
        return False

def calculate_bmi(height, weight):
    h = height / 100
    return round(weight / (h ** 2), 1)

def get_bmi_category(bmi):
    if bmi < 18.5:   return "Underweight"
    elif bmi < 25.0: return "Normal weight"
    elif bmi < 30.0: return "Overweight"
    else:            return "Obese"

def check_health_warning(food_name, condition):
    if not condition or condition.lower() == "none":
        return None
    rules = HEALTH_WARNING_RULES.get(condition)
    if not rules:
        return None
    food_lower = food_name.lower().replace("_", " ")
    for kw in rules["keywords"]:
        if kw in food_lower:
            return rules["message"]
    return None

def call_openrouter(prompt, max_tokens=1000):
    headers = {
        "Authorization": f"Bearer {OPENROUTER_API_KEY}",
        "Content-Type":  "application/json",
        "HTTP-Referer":  "https://nutrivision.ai",
        "X-Title":       "NutriVision",
    }
    for model in CANDIDATE_MODELS:
        print(f"   Trying model: {model}")
        try:
            payload = {
                "model":       model,
                "messages":    [{"role": "user", "content": prompt}],
                "max_tokens":  max_tokens,
                "temperature": 0.4,
            }
            resp = requests.post(OPENROUTER_URL, headers=headers, json=payload, timeout=45)
            print(f"      HTTP {resp.status_code}")
            if resp.status_code != 200:
                print(f"      Error: {resp.text[:300]}")
                continue
            content = (
                resp.json()
                .get("choices", [{}])[0]
                .get("message", {})
                .get("content", "")
                .strip()
            )
            if not content:
                print(f"      Empty content from {model}")
                continue
            print(f"      Got {len(content)} chars from {model}")
            return content, model
        except requests.exceptions.Timeout:
            print(f"      Timeout on {model}")
        except Exception as e:
            print(f"      Exception on {model}: {e}")
    print("   All models failed")
    return None, None

# ============================================================
# MODEL LOADERS
# ============================================================
@functools.lru_cache(maxsize=1)
def load_food101_classifier():
    print("[Model 1] Loading nateraw/food ...")
    try:
        clf = pipeline(
            "image-classification",
            model="nateraw/food",
            device=0 if torch.cuda.is_available() else -1,
        )
        print("[Model 1] Loaded: nateraw/food ✓")
        return clf
    except Exception as e:
        print(f"[Model 1] nateraw/food failed: {e}")
        try:
            clf = pipeline(
                "image-classification",
                model="Kaludi/food-category-classification-v2.0",
                device=0 if torch.cuda.is_available() else -1,
            )
            print("[Model 1] Loaded fallback ✓")
            return clf
        except Exception as e2:
            print(f"[Model 1] Fallback also failed: {e2}")
    return None

@functools.lru_cache(maxsize=1)
def load_indian_western_classifier():
    print("[Model 2] Loading prithivMLmods/Indian-Western-Food-34 ...")
    try:
        clf = pipeline(
            "image-classification",
            model="prithivMLmods/Indian-Western-Food-34",
            device=0 if torch.cuda.is_available() else -1,
        )
        print("[Model 2] Loaded ✓")
        return clf
    except Exception as e:
        print(f"[Model 2] Failed: {e}")
        return None

@functools.lru_cache(maxsize=1)
def load_custom_model():
    print(f"[Model 3] Loading custom model from: {CUSTOM_MODEL_PATH}")
    try:
        # Same loading path as Kaggle notebook (with-img-prepro): local processor + SigLIP head
        # must match checkpoint — do not use ignore_mismatched_sizes (wrong head = bad labels).
        proc = AutoImageProcessor.from_pretrained(CUSTOM_MODEL_PATH, local_files_only=True)
        mdl = SiglipForImageClassification.from_pretrained(
            CUSTOM_MODEL_PATH,
            torch_dtype=torch.float16 if torch.cuda.is_available() else torch.float32,
            local_files_only=True,
        )
        mdl.eval()
        if torch.cuda.is_available():
            mdl = mdl.cuda()
        print("[Model 3] Loaded ✓")
        return proc, mdl
    except Exception as e:
        print(f"[Model 3] FAILED: {e}")
        return None, None

def run_custom_model(image: Image.Image):
    proc, mdl = load_custom_model()
    if proc is None or mdl is None:
        return None
    try:
        image = image.convert("RGB")
        inputs = proc(images=image, return_tensors="pt")
        if torch.cuda.is_available():
            inputs = {k: v.cuda() for k, v in inputs.items()}
        with torch.no_grad():
            logits = mdl(**inputs).logits
        # Eval on Kaggle uses argmax on logits; float32 softmax for confidence only
        logits_f = logits.float()
        probs = F.softmax(logits_f, dim=-1)
        pid = int(torch.argmax(logits_f, dim=-1).item())
        conf = probs[0, pid].item()
        id2label = {int(k): v for k, v in mdl.config.id2label.items()}
        label = id2label.get(pid, "unknown")
        return label, conf
    except Exception as e:
        print(f"[Model 3] Inference error: {e}")
        return None

# ============================================================
# 3-MODEL ENSEMBLE  (specialist routing — vocab lists in food_constants.py)
# ============================================================
def detect_food(image: Image.Image):
    """
    Trust a model when its top-1 is a label that *only that branch is meant to name well*:

    1) Custom (166): if top-1 ∈ CUSTOM_ONLY_CLASSES (not in Food-101 ∪ Indian-34) and conf high → use it.
       (bobbatlu, pulihora, regional dishes — avoids pancakes / fried rice stealing from M3.)

    2) Food-101: if top-1 ∈ MODEL1_ONLY_CLASSES (in Food-101 but not Indian-34) and conf OK → use it.
       (spaghetti bolognese, gyoza — avoids weak custom OOD guesses like chak hao kheer.)

    3) M1 & M2 same label → consensus.

    4) Indian-34 exclusive + high conf.

    5) Fallback: best remaining by raw confidence (last resort).

    This does NOT compare softmax scores across different heads except in step 5.
    """
    m1_label, m1_conf = None, 0.0
    m2_label, m2_conf = None, 0.0
    m3_label, m3_conf = None, 0.0
    candidates = []

    clf1 = load_food101_classifier()
    if clf1 is not None:
        try:
            preds = clf1(image, top_k=3)
            best = preds[0]
            m1_label = squeeze_vocab_label(best["label"])
            m1_conf = best["score"]
            display = m1_label.title() if m1_label else "?"
            candidates.append({"food": display, "confidence": m1_conf, "source": "Food-101 (nateraw)"})
            print(f"  Model 1  [{display}]  {m1_conf*100:.1f}%")
        except Exception as e:
            print(f"  Model 1 inference error: {e}")

    clf2 = load_indian_western_classifier()
    if clf2 is not None:
        try:
            preds = clf2(image, top_k=3)
            best = preds[0]
            m2_label = squeeze_vocab_label(best["label"])
            m2_conf = best["score"]
            display = m2_label.title() if m2_label else "?"
            candidates.append({"food": display, "confidence": m2_conf, "source": "Indian-Western-34"})
            print(f"  Model 2  [{display}]  {m2_conf*100:.1f}%")
        except Exception as e:
            print(f"  Model 2 inference error: {e}")

    custom_result = run_custom_model(image)
    if custom_result:
        raw_label, m3_conf = custom_result
        m3_label = squeeze_vocab_label(raw_label)
        display = m3_label.title() if m3_label else "?"
        candidates.append({"food": display, "confidence": m3_conf, "source": "Custom-Telugu-Indian"})
        print(f"  Model 3  [{display}]  {m3_conf*100:.1f}%")

    if not candidates:
        return "Unknown Food", 0.0, "No model available"

    # --- 1) Custom-exclusive class (only in 166-head vocab vs M1∪M2)
    if (
        m3_label
        and m3_label in CUSTOM_ONLY_CLASSES
        and m3_conf >= CUSTOM_EXCLUSIVE_MIN_CONF
    ):
        print(
            f"  → ENSEMBLE v2: CUSTOM-EXCLUSIVE [{m3_label.title()}] {m3_conf*100:.1f}% "
            f"(class ∉ Food-101∪Indian-34)"
        )
        return m3_label.title(), m3_conf, "Custom-Telugu-Indian (exclusive class)"

    # --- 2) Food-101-only class (in Food-101, not in Indian-Western-34)
    if (
        m1_label
        and m1_label in MODEL1_ONLY_CLASSES
        and m1_conf >= FOOD101_EXCLUSIVE_MIN_CONF
    ):
        print(
            f"  → ENSEMBLE v2: FOOD-101-ONLY [{m1_label.title()}] {m1_conf*100:.1f}% "
            f"(class ∉ Indian-Western-34)"
        )
        return m1_label.title(), m1_conf, "Food-101 (nateraw) — specialist class"

    # --- 3) Two coarse heads agree
    if m1_label and m2_label and m1_label == m2_label:
        avg_conf = (m1_conf + m2_conf) / 2
        if avg_conf >= CONSENSUS_THRESHOLD:
            print(f"  → ENSEMBLE v2: M1+M2 CONSENSUS [{m1_label.title()}] avg={avg_conf*100:.1f}%")
            return m1_label.title(), avg_conf, f"Consensus (M1:{m1_conf*100:.0f}% + M2:{m2_conf*100:.0f}%)"

    # --- 4) Indian-Western-34 exclusive
    if (
        m2_label
        and m2_label in MODEL2_ONLY_CLASSES
        and m2_conf >= MODEL2_EXCLUSIVE_MIN_CONF
    ):
        print(f"  → ENSEMBLE v2: INDIAN-34-ONLY [{m2_label.title()}] {m2_conf*100:.1f}%")
        return m2_label.title(), m2_conf, "Indian-Western-34 (exclusive class)"

    # --- 5) Last resort: max confidence among candidates (different heads — imperfect)
    winner = max(candidates, key=lambda x: x["confidence"])
    print(f"  → ENSEMBLE v2: FALLBACK max-conf [{winner['food']}] {winner['confidence']*100:.1f}%")
    return winner["food"], winner["confidence"], winner["source"]

# ============================================================
# LLM: FULL NUTRITION REPORT
# ============================================================
def generate_full_report(food_name, age, gender, height, weight,
                          bmi, bmi_category, condition, diet_pref):
    cond_str = condition if condition and condition.lower() != "none" else "None"
    prompt = f"""You are a certified nutritionist AI. Return ONLY a raw JSON object — no markdown, no code fences, no explanation. Start with {{ and end with }}.

Analyzing: {food_name}
User: Age {age}, {gender}, Height {height}cm, Weight {weight}kg, BMI {bmi} ({bmi_category}), Diet: {diet_pref}, Condition: {cond_str}

{{
  "nutrition": {{
    "serving_size": "<typical serving size>",
    "calories": "<calories per serving>",
    "protein": "<protein>",
    "carbohydrates": "<carbs>",
    "fat": "<fat>",
    "fiber": "<fiber>",
    "sugar": "<sugar>",
    "sodium": "<sodium>"
  }},
  "health_benefits": ["<benefit 1>","<benefit 2>","<benefit 3>"],
  "portion_advice": "<how much to eat>",
  "health_context": "<how this food affects {cond_str}>",
  "alternatives": [
    {{"name": "<alternative>", "reason": "<why better>"}},
    {{"name": "<alternative>", "reason": "<why better>"}},
    {{"name": "<alternative>", "reason": "<why better>"}}
  ]
}}"""

    raw, model_used = call_openrouter(prompt, max_tokens=1000)
    if not raw:
        return None
    try:
        clean = raw.strip()
        clean = re.sub(r"^```[a-zA-Z]*\n?", "", clean)
        clean = re.sub(r"\n?```$", "", clean.strip())
        m = re.search(r"\{.*\}", clean, re.DOTALL)
        if m:
            clean = m.group(0)
        return json.loads(clean)
    except Exception as e:
        print(f"JSON parse error: {e}")
        return None

# ============================================================
# SHOPPING URLS
# ============================================================
def get_shopping_urls(food_item):
    raw   = food_item.strip()
    q_pct = raw.lower().replace(" ", "%20")
    q_plus= raw.lower().replace(" ", "+")
    return [
        {"platform": "BigBasket", "url": f"https://www.bigbasket.com/ps/?q={q_pct}",    "emoji": "🛒", "category": "grocery"},
        {"platform": "Blinkit",   "url": f"https://blinkit.com/s/?q={q_pct}",           "emoji": "⚡", "category": "grocery"},
        {"platform": "Amazon",    "url": f"https://www.amazon.in/s?k={q_plus}+food",     "emoji": "📦", "category": "grocery"},
        {"platform": "Flipkart",  "url": f"https://www.flipkart.com/search?q={q_pct}",   "emoji": "🛍️", "category": "grocery"},
        {"platform": "Swiggy",    "url": f"https://www.swiggy.com/search?query={q_pct}", "emoji": "🍊", "category": "delivery"},
        {"platform": "Zomato",    "url": f"https://www.zomato.com/search?q={q_pct}",     "emoji": "🔴", "category": "delivery"},
    ]

# ============================================================
# FALLBACK REPORT
# ============================================================
def fallback_report(food_name="this food"):
    return {
        "nutrition": {
            "serving_size": "1 standard serving (~150g)",
            "calories":      "~250 kcal",
            "protein":       "~8g",
            "carbohydrates": "~35g",
            "fat":           "~10g",
            "fiber":         "~3g",
            "sugar":         "~5g",
            "sodium":        "~200mg",
        },
        "health_benefits": [
            f"{food_name} provides essential macronutrients for daily energy.",
            "Contains dietary fiber supporting digestive health.",
            "Source of micronutrients important for body functions.",
        ],
        "portion_advice":  f"Consume 1 standard serving of {food_name} as part of a balanced diet.",
        "health_context":  f"Consult a nutritionist for personalised advice about {food_name}.",
        "alternatives": [
            {"name": "Steamed Vegetables", "reason": "Low calories, high fiber and nutrients"},
            {"name": "Grilled Chicken",    "reason": "Lean protein, low in saturated fat"},
            {"name": "Fresh Fruit Bowl",   "reason": "Natural sugars with vitamins and antioxidants"},
        ],
    }

# ============================================================
# SHARED ANALYSIS CORE
# ============================================================
def build_response(food_name, confidence, detection_source,
                   age, gender, height, weight, diet_pref, condition,
                   user_id=None, image_path=None):
    bmi          = calculate_bmi(height, weight)
    bmi_category = get_bmi_category(bmi)
    warning      = check_health_warning(food_name, condition)

    report = generate_full_report(
        food_name, age, gender, height, weight,
        bmi, bmi_category, condition, diet_pref,
    )
    if report is None:
        report = fallback_report(food_name)

    alternatives = [
        {"name": a["name"], "reason": a["reason"], "urls": get_shopping_urls(a["name"])}
        for a in report.get("alternatives", [])
    ]

    result = {
        "food":             food_name,
        "confidence":       f"{confidence * 100:.1f}%",
        "detection_source": detection_source,
        "bmi":              bmi,
        "bmi_category":     bmi_category,
        "nutrition":        report.get("nutrition", {}),
        "health_benefits":  report.get("health_benefits", []),
        "portion_advice":   report.get("portion_advice", "1 standard serving"),
        "health_context":   report.get("health_context", ""),
        "alternatives":     alternatives,
        "warning":          warning,
    }

    # Save to DB if user is logged in
    if user_id:
        try:
            conn = get_db()
            conn.execute(
                """INSERT INTO analyses
                   (user_id, food_name, confidence, detection_source,
                    age, gender, height, weight, bmi, bmi_category,
                    diet_pref, condition, nutrition_json, health_benefits,
                    portion_advice, health_context, alternatives_json,
                    image_path, created)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                (user_id, food_name, result["confidence"], detection_source,
                 str(age), gender, str(height), str(weight), bmi, bmi_category,
                 diet_pref, condition,
                 json.dumps(report.get("nutrition", {})),
                 json.dumps(report.get("health_benefits", [])),
                 report.get("portion_advice", ""),
                 report.get("health_context", ""),
                 json.dumps(alternatives),
                 image_path,
                 datetime.utcnow().isoformat())
            )
            conn.commit()
            conn.close()
            print(f"[DB] Analysis saved for user_id={user_id}")
        except Exception as e:
            print(f"[DB] Failed to save analysis: {e}")

    return result

# ============================================================
# AUTH ROUTES
# ============================================================
@app.route("/api/auth/register", methods=["POST"])
def api_register():
    data     = request.get_json(force=True)
    username = data.get("username", "").strip()
    email    = data.get("email", "").strip().lower()
    password = data.get("password", "")

    if not username or not email or not password:
        return jsonify({"error": "All fields required"}), 400
    if len(password) < 6:
        return jsonify({"error": "Password must be at least 6 characters"}), 400

    conn = get_db()
    try:
        conn.execute(
            "INSERT INTO users (username, email, password, created) VALUES (?, ?, ?, ?)",
            (username, email, hash_password(password), datetime.utcnow().isoformat())
        )
        conn.commit()
        user_id = conn.execute("SELECT id FROM users WHERE email=?", (email,)).fetchone()["id"]
        token   = create_session(user_id)
        conn.close()
        return jsonify({"token": token, "username": username, "user_id": user_id})
    except sqlite3.IntegrityError as e:
        conn.close()
        if "username" in str(e):
            return jsonify({"error": "Username already taken"}), 409
        return jsonify({"error": "Email already registered"}), 409

@app.route("/api/auth/login", methods=["POST"])
def api_login():
    data     = request.get_json(force=True)
    email    = data.get("email", "").strip().lower()
    password = data.get("password", "")
    conn     = get_db()
    row      = conn.execute(
        "SELECT * FROM users WHERE email=? AND password=?",
        (email, hash_password(password))
    ).fetchone()
    conn.close()
    if not row:
        return jsonify({"error": "Invalid email or password"}), 401
    user  = dict(row)
    token = create_session(user["id"])
    return jsonify({"token": token, "username": user["username"], "user_id": user["id"]})

@app.route("/api/auth/logout", methods=["POST"])
def api_logout():
    token = request.headers.get("X-Auth-Token") or request.cookies.get("nv_token")
    if token:
        conn = get_db()
        conn.execute("DELETE FROM sessions WHERE token=?", (token,))
        conn.commit()
        conn.close()
    return jsonify({"ok": True})

@app.route("/api/auth/me", methods=["GET"])
def api_me():
    token = request.headers.get("X-Auth-Token")
    user  = get_user_from_token(token)
    if not user:
        return jsonify({"error": "Not authenticated"}), 401
    return jsonify({"username": user["username"], "user_id": user["id"], "email": user["email"]})

# ============================================================
# HISTORY ROUTES
# ============================================================
@app.route("/api/history", methods=["GET"])
@require_auth
def api_history(user):
    conn = get_db()
    rows = conn.execute(
        "SELECT id, food_name, confidence, condition, bmi, bmi_category, created, image_path "
        "FROM analyses WHERE user_id=? ORDER BY id DESC LIMIT 20",
        (user["id"],)
    ).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])

@app.route("/api/history/<int:aid>", methods=["GET"])
@require_auth
def api_history_detail(user, aid):
    conn = get_db()
    row  = conn.execute(
        "SELECT * FROM analyses WHERE id=? AND user_id=?", (aid, user["id"])
    ).fetchone()
    conn.close()
    if not row:
        return jsonify({"error": "Not found"}), 404
    d = dict(row)
    for k in ["nutrition_json", "health_benefits", "alternatives_json"]:
        try: d[k] = json.loads(d[k] or "null")
        except: pass
    return jsonify(d)

# ============================================================
# CHATBOT ROUTES
# ============================================================
@app.route("/api/chat", methods=["POST"])
@require_auth
def api_chat(user):
    data    = request.get_json(force=True)
    message = data.get("message", "").strip()
    if not message:
        return jsonify({"error": "Empty message"}), 400

    user_id = user["id"]

    # Persist user message
    conn = get_db()
    conn.execute(
        "INSERT INTO chat_messages (user_id, role, content, created) VALUES (?,?,?,?)",
        (user_id, "user", message, datetime.utcnow().isoformat())
    )
    conn.commit()

    # Last 10 messages for context
    history_rows = conn.execute(
        "SELECT role, content FROM chat_messages WHERE user_id=? ORDER BY id DESC LIMIT 10",
        (user_id,)
    ).fetchall()
    conn.close()

    history = list(reversed([dict(r) for r in history_rows]))

    # Current + past health context
    current_condition = get_user_latest_condition(user_id) or "None"
    past_conditions   = get_user_past_conditions(user_id) or "None mentioned"

    # Detect & store past condition mentions
    keywords = ["used to have", "had", "history of", "suffered from", "recovered from",
                "diagnosed with", "used to be", "previously had", "past", "formerly",
                "used to", "before i had", "i had"]
    if any(kw in message.lower() for kw in keywords):
        conn2 = get_db()
        existing = conn2.execute(
            "SELECT past_conditions FROM user_health_context WHERE user_id=?", (user_id,)
        ).fetchone()
        new_text = (existing["past_conditions"] + "\n" + message) if existing else message
        conn2.execute(
            "INSERT OR REPLACE INTO user_health_context (user_id, past_conditions, notes, updated) "
            "VALUES (?, ?, ?, ?)",
            (user_id, new_text, "", datetime.utcnow().isoformat())
        )
        conn2.commit()
        conn2.close()
        past_conditions = new_text

    system_prompt = f"""You are NutriBot, a warm, expert AI nutritionist for NutriVision.

USER PROFILE:
- Name: {user["username"]}
- Current health condition (from their latest food analysis): {current_condition}
- Past / historical health conditions they have mentioned in chat: {past_conditions}

YOUR RULES:
1. Give personalised food and nutrition advice based on BOTH current AND past health conditions.
2. When the user mentions past diseases (e.g. "I used to have high BP", "I had COVID"), acknowledge and factor them in.
3. Be warm, supportive, and specific. Avoid generic answers.
4. Keep responses concise — 3-5 sentences unless a list is genuinely needed.
5. Relate food questions to their health context.
6. End with a short encouraging note or a follow-up question.
7. Only suggest consulting a doctor when truly necessary (not every response).
8. Use Indian food context naturally (dal, roti, idli, sabzi, etc.) where relevant.
9. Do NOT use asterisks, markdown, or bullet symbols. Write in plain sentences."""

    messages = [{"role": "system", "content": system_prompt}]
    for h in history[:-1]:
        messages.append({"role": h["role"], "content": h["content"]})
    messages.append({"role": "user", "content": message})

    headers = {
        "Authorization": f"Bearer {OPENROUTER_API_KEY}",
        "Content-Type":  "application/json",
        "HTTP-Referer":  "https://nutrivision.ai",
        "X-Title":       "NutriVision",
    }

    bot_reply = "Sorry, I'm having a little trouble right now. Please try again in a moment!"
    for model in CANDIDATE_MODELS:
        try:
            payload = {
                "model":       model,
                "messages":    messages,
                "max_tokens":  400,
                "temperature": 0.65,
            }
            resp = requests.post(OPENROUTER_URL, headers=headers, json=payload, timeout=30)
            if resp.status_code == 200:
                content = (resp.json().get("choices", [{}])[0]
                           .get("message", {}).get("content", "").strip())
                if content:
                    bot_reply = content
                    break
        except Exception as e:
            print(f"[Chat] {model} error: {e}")

    # Persist bot reply
    conn3 = get_db()
    conn3.execute(
        "INSERT INTO chat_messages (user_id, role, content, created) VALUES (?,?,?,?)",
        (user_id, "assistant", bot_reply, datetime.utcnow().isoformat())
    )
    conn3.commit()
    conn3.close()

    return jsonify({"reply": bot_reply})

@app.route("/api/chat/history", methods=["GET"])
@require_auth
def api_chat_history(user):
    conn = get_db()
    rows = conn.execute(
        "SELECT role, content, created FROM chat_messages "
        "WHERE user_id=? ORDER BY id ASC LIMIT 50",
        (user["id"],)
    ).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])

# ============================================================
# FLASK PAGES
# ============================================================
@app.route("/")
def home():
    return render_template("home.html")

@app.route("/analyzer")
def analyzer():
    return render_template("index.html")

@app.route("/about")
def about():
    return render_template("about.html")

# ============================================================
# ANALYZE ROUTES (updated to save per user)
# ============================================================
@app.route("/analyze", methods=["POST"])
def analyze():
    try:
        if "image" not in request.files:
            return jsonify({"error": "No image uploaded"}), 400
        image_file = request.files["image"]
        if not image_file.filename or not allowed_file(image_file.filename):
            return jsonify({"error": "Please upload an image file."}), 400
        if not is_valid_image_upload(image_file):
            return jsonify({"error": "Invalid image content. Please upload a valid image file."}), 400

        age       = request.form.get("age", "25")
        gender    = request.form.get("gender", "Male")
        height    = float(request.form.get("height", "170"))
        weight    = float(request.form.get("weight", "70"))
        diet_pref = request.form.get("preference", "Vegetarian")
        condition = request.form.get("condition", "None")

        # Auth (optional — saves if logged in)
        token   = request.headers.get("X-Auth-Token") or request.form.get("auth_token")
        user    = get_user_from_token(token)
        user_id = user["id"] if user else None

        filename = secure_filename(image_file.filename)
        if not filename:
            filename = f"upload_{secrets.token_hex(8)}.img"
        img_path = os.path.join(app.config["UPLOAD_FOLDER"], filename)
        image_file.save(img_path)

        print("\n" + "=" * 60)
        print(f"[UPLOAD] {age}y {gender}, h={height} w={weight}, cond={condition}, user={user_id}")
        image = Image.open(img_path).convert("RGB")
        print("--- 3-MODEL ENSEMBLE ---")
        food_name, confidence, detection_source = detect_food(image)
        print("--- LLM REPORT ---")
        return jsonify(build_response(
            food_name, confidence, detection_source,
            age, gender, height, weight, diet_pref, condition,
            user_id=user_id, image_path=img_path
        ))
    except Exception as e:
        import traceback; traceback.print_exc()
        return jsonify({"error": f"Analysis failed: {str(e)}"}), 500

@app.route("/analyze_webcam", methods=["POST"])
def analyze_webcam():
    try:
        data      = request.get_json(force=True)
        image_b64 = data.get("image_data", "")
        age       = data.get("age", "25")
        gender    = data.get("gender", "Male")
        height    = float(data.get("height", 170))
        weight    = float(data.get("weight", 70))
        diet_pref = data.get("preference", "Vegetarian")
        condition = data.get("condition", "None")

        token   = request.headers.get("X-Auth-Token") or data.get("auth_token")
        user    = get_user_from_token(token)
        user_id = user["id"] if user else None

        if not image_b64:
            return jsonify({"error": "No webcam image data received"}), 400
        if "," in image_b64:
            image_b64 = image_b64.split(",", 1)[1]

        image = Image.open(io.BytesIO(base64.b64decode(image_b64))).convert("RGB")
        print("\n" + "=" * 60)
        print(f"[WEBCAM] {age}y {gender}, cond={condition}, user={user_id}")
        food_name, confidence, detection_source = detect_food(image)
        return jsonify(build_response(
            food_name, confidence, detection_source,
            age, gender, height, weight, diet_pref, condition,
            user_id=user_id
        ))
    except Exception as e:
        import traceback; traceback.print_exc()
        return jsonify({"error": f"Webcam analysis failed: {str(e)}"}), 500

@app.route("/analyze_text", methods=["POST"])
def analyze_text():
    try:
        data      = request.get_json(force=True)
        food_name = data.get("food_name", "").strip()
        age       = data.get("age", "25")
        gender    = data.get("gender", "Male")
        height    = float(data.get("height", 170))
        weight    = float(data.get("weight", 70))
        diet_pref = data.get("preference", "Vegetarian")
        condition = data.get("condition", "None")

        token   = request.headers.get("X-Auth-Token") or data.get("auth_token")
        user    = get_user_from_token(token)
        user_id = user["id"] if user else None

        if not food_name:
            return jsonify({"error": "Please enter a food name"}), 400

        print("\n" + "=" * 60)
        print(f"[TEXT] food='{food_name}', cond={condition}, user={user_id}")
        return jsonify(build_response(
            food_name.title(), 1.0, "Text Input",
            age, gender, height, weight, diet_pref, condition,
            user_id=user_id
        ))
    except Exception as e:
        import traceback; traceback.print_exc()
        return jsonify({"error": f"Text analysis failed: {str(e)}"}), 500

# ============================================================
# STARTUP
# ============================================================
if __name__ == "__main__":
    print("=" * 60)
    print("NutriVision starting...")
    print(f"GPU           : {torch.cuda.is_available()}")
    print(f"Torch         : {torch.__version__}")
    print(f"Custom model  : {CUSTOM_MODEL_PATH}")
    print(f"Custom-exclusive classes : {len(CUSTOM_ONLY_CLASSES)} (M3 wins first if conf≥{CUSTOM_EXCLUSIVE_MIN_CONF*100:.0f}%)")
    print(f"Ensemble v2   : M3 custom-only → M1 Food-101-only → M1+M2 consensus → M2-only → fallback")
    print(f"OpenRouter key: {OPENROUTER_API_KEY[:22]}...")
    print("=" * 60)

    init_db()

    print("\n[Startup] Pre-loading all models...")
    load_food101_classifier()
    load_indian_western_classifier()
    load_custom_model()
    print("[Startup] All models ready. Starting server...\n")

    app.run(host="0.0.0.0", port=7860, debug=False)