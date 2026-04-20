// src/pages/Analyzer.js
import React, { useState, useRef, useCallback, useEffect } from 'react';
import ProfileForm    from '../components/ProfileForm';
import WarningPopup   from '../components/WarningPopup';
import LoadingOverlay from '../components/LoadingOverlay';
import ResultsPanel   from '../components/ResultsPanel';
import Footer         from '../components/Footer';
import { useAuth }    from '../context/AuthContext';

const DEFAULT_PROFILE = {
  age: '25', gender: 'Male', height: '170', weight: '70',
  preference: 'Vegetarian', condition: 'None',
};

function Toast({ msg, type, onDone }) {
  useEffect(() => {
    const t = setTimeout(onDone, 3500);
    return () => clearTimeout(t);
  }, [onDone]);
  const bg = type === 'error' ? '#f47171' : type === 'info' ? 'var(--blue)' : 'var(--mint)';
  return (
    <div style={{
      position: 'fixed', bottom: '1.5rem', right: '1.5rem', zIndex: 99999,
      padding: '.85rem 1.4rem', borderRadius: 12, fontSize: '.9rem', fontWeight: 600,
      background: bg, color: '#fff', boxShadow: '0 8px 24px rgba(0,0,0,.4)',
      maxWidth: 320, lineHeight: 1.4,
    }}>
      {msg}
    </div>
  );
}

export default function Analyzer() {
  const { token, user } = useAuth();

  const [activeTab, setActiveTab] = useState('upload');
  const [profile, setProfile]     = useState(DEFAULT_PROFILE);

  // Upload tab
  const [imgFile, setImgFile]     = useState(null);
  const [imgPreview, setImgPreview] = useState(null);
  const fileInputRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);

  // Webcam tab
  const videoRef    = useRef(null);
  const canvasRef   = useRef(null);
  const [webcamStream, setWebcamStream]   = useState(null);
  const [capturedB64, setCapturedB64]     = useState(null);
  const [webcamStarted, setWebcamStarted] = useState(false);
  const [webcamSnapped, setWebcamSnapped] = useState(false);

  // Text tab
  const [foodName, setFoodName] = useState('');

  // Loading / results / warning
  const [loading, setLoading]       = useState(false);
  const [loadStep, setLoadStep]     = useState(0);
  const [results, setResults]       = useState(null);
  const [pendingData, setPendingData] = useState(null);
  const [toast, setToast]           = useState(null);

  const resultsPanelRef = useRef(null);

  const showToast = useCallback((msg, type = 'info') => { setToast({ msg, type }); }, []);

  // ── Stop webcam ──
  const stopWebcam = useCallback(() => {
    if (webcamStream) { webcamStream.getTracks().forEach(t => t.stop()); setWebcamStream(null); }
    setWebcamStarted(false);
  }, [webcamStream]);

  useEffect(() => {
    if (activeTab !== 'webcam') stopWebcam();
  }, [activeTab]); // eslint-disable-line

  // ── File handling ──
  const handleFile = (file) => {
    if (!['image/png','image/jpeg','image/jpg','image/webp'].includes(file.type)) {
      showToast('⚠️ Please upload PNG, JPG, JPEG, or WebP', 'error'); return;
    }
    if (file.size > 16 * 1024 * 1024) { showToast('⚠️ File too large. Max 16MB.', 'error'); return; }
    setImgFile(file);
    const reader = new FileReader();
    reader.onload = e => setImgPreview(e.target.result);
    reader.readAsDataURL(file);
  };

  const onDrop = (e) => {
    e.preventDefault(); setIsDragging(false);
    if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
  };

  // ── Handle API response ──
  const handleResponse = (data) => {
    if (data.warning) {
      setPendingData(data);
    } else {
      setResults(data);
      setTimeout(() => resultsPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 200);
    }
  };

  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  // ── Auth headers helper ──
  const authHeaders = useCallback(() => {
    const h = {};
    if (token) h['X-Auth-Token'] = token;
    return h;
  }, [token]);

  const runAnalysis = async (fetchFn) => {
    setLoading(true); setLoadStep(1); setResults(null); setPendingData(null);
    try {
      const resp = await fetchFn();
      setLoadStep(2);
      const data = await resp.json();
      setLoadStep(3);
      if (!resp.ok) throw new Error(data.error || 'Analysis failed');
      setLoadStep(4);
      await sleep(400);
      setLoading(false);
      handleResponse(data);
    } catch (err) {
      setLoading(false);
      showToast('❌ ' + err.message, 'error');
    }
  };

  // ── Tab 1: Upload submit ──
  const handleUploadSubmit = async () => {
    if (!imgFile) { showToast('⚠️ Please upload a food image first', 'error'); return; }
    const fd = new FormData();
    fd.append('image', imgFile);
    fd.append('age', profile.age);
    fd.append('gender', profile.gender);
    fd.append('height', profile.height);
    fd.append('weight', profile.weight);
    fd.append('preference', profile.preference);
    fd.append('condition', profile.condition);
    if (token) fd.append('auth_token', token);
    await runAnalysis(() => fetch('/analyze', {
      method: 'POST',
      headers: authHeaders(),
      body: fd,
    }));
  };

  // ── Tab 2: Webcam ──
  const startWebcam = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      setWebcamStream(stream);
      setWebcamStarted(true);
      setWebcamSnapped(false);
      setCapturedB64(null);
      if (videoRef.current) { videoRef.current.srcObject = stream; }
    } catch (err) { showToast('❌ Camera access denied: ' + err.message, 'error'); }
  };

  useEffect(() => {
    if (webcamStarted && webcamStream && videoRef.current) {
      videoRef.current.srcObject = webcamStream;
    }
  }, [webcamStarted, webcamStream]);

  const snapWebcam = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    canvas.width  = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    canvas.getContext('2d').drawImage(video, 0, 0);
    const b64 = canvas.toDataURL('image/jpeg', 0.9);
    setCapturedB64(b64);
    setWebcamSnapped(true);
    stopWebcam();
  };

  const retakeWebcam = async () => {
    setCapturedB64(null); setWebcamSnapped(false);
    await startWebcam();
  };

  const handleWebcamSubmit = async () => {
    if (!capturedB64) { showToast('⚠️ Please capture a photo first', 'error'); return; }
    await runAnalysis(() => fetch('/analyze_webcam', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ image_data: capturedB64, ...profile, auth_token: token || '' }),
    }));
  };

  // ── Tab 3: Text ──
  const handleTextSubmit = async () => {
    if (!foodName.trim()) { showToast('⚠️ Please enter a food name', 'error'); return; }
    await runAnalysis(() => fetch('/analyze_text', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ food_name: foodName, ...profile, auth_token: token || '' }),
    }));
  };

  // ── Reset ──
  const resetAnalyzer = () => {
    setImgFile(null); setImgPreview(null);
    setCapturedB64(null); setWebcamSnapped(false);
    setFoodName(''); setResults(null); setPendingData(null);
    stopWebcam();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <>
      {pendingData && (
        <WarningPopup
          message={pendingData.warning}
          onProceed={() => {
            const d = pendingData;
            setPendingData(null);
            setResults(d);
            setTimeout(() => resultsPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 200);
          }}
          onCancel={() => {
            setPendingData(null);
            showToast('↩️ Go back and choose a different food', 'info');
          }}
        />
      )}

      <LoadingOverlay active={loading} step={loadStep} />
      {toast && <Toast msg={toast.msg} type={toast.type} onDone={() => setToast(null)} />}

      <div className="page-wrap">
        <div className="page-hero">
          <div className="orb orb--a" style={{ opacity: .4 }} />
          <div className="orb orb--b" style={{ opacity: .3 }} />
          <div className="container" style={{ position: 'relative', zIndex: 2, textAlign: 'center' }}>
            <h1 className="page-title">🔬 Food Analyzer</h1>
            <p className="page-sub">Upload a food image, snap with webcam, or type the food name — get your personalised AI nutrition report</p>
            {user && (
              <div style={{ marginTop: '.75rem', display: 'inline-flex', alignItems: 'center', gap: '.5rem', background: 'rgba(59,158,255,.12)', border: '1px solid rgba(59,158,255,.25)', borderRadius: '100px', padding: '.3rem 1rem', fontSize: '.82rem', color: 'var(--blue)', fontFamily: 'var(--fh)', fontWeight: 700 }}>
                ✅ Results will be saved to your account, {user.username}
              </div>
            )}
          </div>
        </div>

        <div className="container analyzer-layout">
          <div className="form-card" id="formCard">
            <div className="input-tabs">
              {['upload','webcam','text'].map(tab => (
                <button key={tab} className={`itab${activeTab === tab ? ' itab--active' : ''}`} onClick={() => setActiveTab(tab)}>
                  {tab === 'upload' ? '📸 Upload' : tab === 'webcam' ? '📷 Webcam' : '✍️ Type Name'}
                </button>
              ))}
            </div>

            {activeTab === 'upload' && (
              <div id="panelUpload">
                <div
                  className={`upload-zone${isDragging ? ' dragover' : ''}`}
                  onClick={() => !imgPreview && fileInputRef.current?.click()}
                  onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={onDrop}
                >
                  <input
                    type="file" accept="image/*" hidden
                    ref={fileInputRef}
                    onChange={e => { if (e.target.files[0]) handleFile(e.target.files[0]); }}
                  />
                  {imgPreview ? (
                    <div className="upload-preview">
                      <img src={imgPreview} alt="Food preview" />
                      <button type="button" className="remove-btn" title="Remove image"
                        onClick={e => { e.stopPropagation(); setImgFile(null); setImgPreview(null); }}>✕</button>
                    </div>
                  ) : (
                    <div className="upload-placeholder">
                      <div className="upload-icon-wrap">📸</div>
                      <h3>Drop food image here</h3>
                      <p>or click to browse · PNG, JPG, JPEG, WebP · Max 16 MB</p>
                    </div>
                  )}
                </div>
                <ProfileForm profile={profile} onChange={setProfile} />
                <button className="btn btn--primary btn--full" onClick={handleUploadSubmit} disabled={loading}>
                  {loading ? <span className="btn-spinner" /> : '🔬 Analyze Food'}
                </button>
              </div>
            )}

            {activeTab === 'webcam' && (
              <div id="panelWebcam">
                <div className="webcam-wrap">
                  {webcamSnapped && capturedB64 ? (
                    <div className="webcam-preview-wrap">
                      <img src={capturedB64} alt="Captured" className="webcam-captured-img" />
                      <button className="btn btn--outline btn--sm" onClick={retakeWebcam}>🔄 Retake</button>
                    </div>
                  ) : webcamStarted ? (
                    <>
                      <video ref={videoRef} className="webcam-video" autoPlay playsInline muted style={{ display: 'block' }} />
                      <div className="webcam-controls">
                        <button className="btn btn--primary" onClick={snapWebcam}>📸 Capture Photo</button>
                      </div>
                    </>
                  ) : (
                    <div className="webcam-controls">
                      <button className="btn btn--primary" onClick={startWebcam}>📷 Start Camera</button>
                    </div>
                  )}
                  <canvas ref={canvasRef} style={{ display: 'none' }} />
                </div>
                <ProfileForm profile={profile} onChange={setProfile} />
                <button className="btn btn--primary btn--full" onClick={handleWebcamSubmit} disabled={loading}>
                  {loading ? <span className="btn-spinner" /> : '🔬 Analyze Captured Photo'}
                </button>
              </div>
            )}

            {activeTab === 'text' && (
              <div id="panelText">
                <div className="text-input-wrap">
                  <label className="text-food-label">🍽️ Enter Food Name</label>
                  <input
                    type="text"
                    className="food-name-input"
                    placeholder="e.g. Biryani, Gulab Jamun, Pizza, Dosa…"
                    value={foodName}
                    onChange={e => setFoodName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleTextSubmit(); }}
                    autoComplete="off"
                  />
                  <p className="text-hint">Type the exact food name for best nutrition results</p>
                </div>
                <ProfileForm profile={profile} onChange={setProfile} />
                <button className="btn btn--primary btn--full" onClick={handleTextSubmit} disabled={loading}>
                  {loading ? <span className="btn-spinner" /> : '🔬 Analyze Food'}
                </button>
              </div>
            )}
          </div>

          <div ref={resultsPanelRef}>
            {results ? (
              <ResultsPanel data={results} onReset={resetAnalyzer} />
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 340 }}>
                <div style={{ textAlign: 'center', color: 'var(--muted)' }}>
                  <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>🍽️</div>
                  <p style={{ fontFamily: 'var(--fh)', fontWeight: 700, fontSize: '1.1rem', color: 'var(--sub)', marginBottom: '.5rem' }}>Your results will appear here</p>
                  <p style={{ fontSize: '.88rem' }}>Upload an image, snap with your webcam, or type a food name to get started.</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <Footer minimal />
    </>
  );
}