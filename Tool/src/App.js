import React from 'react';
import './App.css';
import FlowWizard from './flows/FlowWizard';

function App() {
  return (
    <div className="App">
      <header className="App-header">
        <h1>AI-Powered SDLC Assistant</h1>
        <p className="subtitle">End-to-end SDLC assistant — generate everything with one click.</p>
      </header>
      <main>
        <FlowWizard />
      </main>
      <footer className="footer">
        <small>Tip: Upload or paste your requirement, then click “Generate SDLC Pack”.</small>
      </footer>
    </div>
  );
}

export default App;

