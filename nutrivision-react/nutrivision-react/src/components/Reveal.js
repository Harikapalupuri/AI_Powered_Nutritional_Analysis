import React from 'react';
import useReveal from './useReveal';

export default function Reveal({ children, className = '', delay = '' }) {
  const ref = useReveal();
  return (
    <div ref={ref} className={`reveal${delay ? ' ' + delay : ''}${className ? ' ' + className : ''}`}>
      {children}
    </div>
  );
}
