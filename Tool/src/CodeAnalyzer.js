import React, { useState } from 'react';
import { useApiPost } from './useApiPost';
import API_BASE_URL from './config';

const API_URL = `${API_BASE_URL}/analyze-code`;

function CodeAnalyzer() {
  const [code, setCode] = useState('');
  const [copyMsg, setCopyMsg] = useState('');
  const { data: result, error, isLoading, postData } = useApiPost(API_URL);

  const handleAnalyze = async () => {
    setCopyMsg('');
    postData({ code });
  };

  const clearAll = () => {
    setCode('');
    setCopyMsg('');
  };

  const copyDoc = () => {
    if (!result?.documentation) return;
    navigator.clipboard.writeText(result.documentation).then(() => {
      setCopyMsg('Documentation copied');
      setTimeout(() => setCopyMsg(''), 1500);
    });
  };

  const copySuggestions = () => {
    if (!result?.suggestions?.length) return;
    navigator.clipboard.writeText(result.suggestions.join('\n')).then(() => {
      setCopyMsg('Suggestions copied');
      setTimeout(() => setCopyMsg(''), 1500);
    });
  };

  return (
    <div className="feature-container">
      <h2>2. Code Quality & Documentation Assistant</h2>
      <label htmlFor="code-input" className="muted">Paste code to analyze</label>
      <textarea
        id="code-input"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        placeholder="e.g., function getUser(id) { /* ... */ }"
        disabled={isLoading}
        aria-label="Code snippet"
      />
      <div className="btn-row">
        <button onClick={handleAnalyze} disabled={!code || isLoading}>
          {isLoading ? (<><span className="spinner"/>Analyzing...</>) : 'Analyze Code'}
        </button>
        <button className="btn-secondary" onClick={clearAll} disabled={isLoading}>Clear</button>
        <span className="muted">{code.length} characters</span>
        {copyMsg && <span className="muted">• {copyMsg}</span>}
      </div>

      {error && <div className="alert" role="alert">{error}</div>}

      {result && (
        <div className="results">
          <div className="results-header">
            <h3>Suggested Documentation</h3>
            <div className="btn-row">
              <button className="copy-btn" onClick={copyDoc} disabled={!result?.documentation}>Copy Doc</button>
              <button className="copy-btn" onClick={copySuggestions} disabled={!result?.suggestions?.length}>Copy Suggestions</button>
            </div>
          </div>
          {result.documentation && <pre>{result.documentation}</pre>}
          {result?.suggestions?.length > 0 && (
            <>
              <h3>Quality & Best Practice Suggestions</h3>
              <ul>
                {result.suggestions.map((suggestion, index) => (
                  <li key={index}>{suggestion}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default CodeAnalyzer;
