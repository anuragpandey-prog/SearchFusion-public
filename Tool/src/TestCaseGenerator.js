import React, { useState } from 'react';
import { useApiPost } from './useApiPost';
import API_BASE_URL from './config';

const API_URL = `${API_BASE_URL}/generate-test-cases`;

function TestCaseGenerator() {
  const [userStory, setUserStory] = useState('');
  const [copyMsg, setCopyMsg] = useState('');
  const { data: result, error, isLoading, postData } = useApiPost(API_URL);

  const handleGenerate = async () => {
    setCopyMsg('');
    postData({ userStory });
  };

  const handleCopy = () => {
    if (!result?.testCases?.length) return;
    const textToCopy = result.testCases.join('\n');
    navigator.clipboard.writeText(textToCopy).then(() => {
      setCopyMsg('Copied');
      setTimeout(() => setCopyMsg(''), 1500);
    }, () => {
      setCopyMsg('Copy failed');
      setTimeout(() => setCopyMsg(''), 1500);
    });
  };

  const clearAll = () => {
    setUserStory('');
    setCopyMsg('');
  };

  return (
    <div className="feature-container">
      <h2>3. Test Case Generator</h2>
      <label htmlFor="story-input" className="muted">Paste a user story or requirement</label>
      <textarea
        id="story-input"
        value={userStory}
        onChange={(e) => setUserStory(e.target.value)}
        placeholder="e.g., As a user, I want to reset my password so that I can regain access."
        disabled={isLoading}
        aria-label="User story or requirement"
      />
      <div className="btn-row">
        <button onClick={handleGenerate} disabled={!userStory || isLoading}>
          {isLoading ? (<><span className="spinner"/>Generating...</>) : 'Generate Test Cases'}
        </button>
        <button className="btn-secondary" onClick={clearAll} disabled={isLoading}>Clear</button>
        <span className="muted">{userStory.length} characters</span>
        {copyMsg && <span className="muted">• {copyMsg}</span>}
      </div>

      {error && <div className="alert" role="alert">{error}</div>}

      {result && (
        <div className="results">
          <div className="results-header">
            <h3>Generated Test Cases</h3>
            <button className="copy-btn" onClick={handleCopy} disabled={!result?.testCases?.length}>Copy</button>
          </div>
          {result?.testCases?.length > 0 && (
            <ul>
              {result.testCases.map((testCase, index) => (
                <li key={index}>{testCase}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

export default TestCaseGenerator;
