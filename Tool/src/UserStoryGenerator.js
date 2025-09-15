import React, { useState } from 'react';
import { useApiPost } from './useApiPost';
import API_BASE_URL from './config';

const API_URL = `${API_BASE_URL}/generate-user-story`;

function UserStoryGenerator() {
  const [requirement, setRequirement] = useState('');
  const [copyMsg, setCopyMsg] = useState('');
  const [showResults, setShowResults] = useState(true);
  const { data: result, error, isLoading, postData } = useApiPost(API_URL);

  const handleGenerate = async () => {
    setCopyMsg('');
    setShowResults(true);
    postData({ requirement });
  };

  const handleClear = () => {
    setRequirement('');
    setCopyMsg('');
    setShowResults(false);
  };

  const copyUserStory = () => {
    if (!result?.userStory) return;
    navigator.clipboard.writeText(result.userStory).then(() => {
      setCopyMsg('User story copied');
      setTimeout(() => setCopyMsg(''), 1500);
    });
  };

  const copyAcceptance = () => {
    if (!result?.acceptanceCriteria?.length) return;
    const text = result.acceptanceCriteria.join('\n');
    navigator.clipboard.writeText(text).then(() => {
      setCopyMsg('Acceptance criteria copied');
      setTimeout(() => setCopyMsg(''), 1500);
    });
  };

  return (
    <div className="feature-container">
      <h2>1. Requirement Analysis & User Story Generator</h2>
      <label htmlFor="requirement-input" className="muted">Describe the business requirement</label>
      <textarea
        id="requirement-input"
        value={requirement}
        onChange={(e) => setRequirement(e.target.value)}
        placeholder="e.g., The system should allow users to log in using email and password."
        disabled={isLoading}
        aria-label="Requirement"
      />
      <div className="btn-row">
        <button onClick={handleGenerate} disabled={!requirement || isLoading}>
          {isLoading ? (<><span className="spinner"/>Generating...</>) : 'Generate User Story'}
        </button>
        <button className="btn-secondary" onClick={handleClear} disabled={isLoading}>Clear</button>
        <span className="muted">{requirement.length} characters</span>
        {copyMsg && <span className="muted">• {copyMsg}</span>}
      </div>

      {error && <div className="alert" role="alert">{error}</div>}

      {showResults && result && (
        <div className="results">
          <div className="results-header">
            <h3>Generated User Story</h3>
            <div className="btn-row">
              <button className="copy-btn" onClick={copyUserStory}>Copy Story</button>
              <button className="copy-btn" onClick={copyAcceptance} disabled={!result?.acceptanceCriteria?.length}>Copy Criteria</button>
            </div>
          </div>
          {result.userStory && <p><em>{result.userStory}</em></p>}
          {result?.acceptanceCriteria?.length > 0 && (
            <>
              <h3>Acceptance Criteria</h3>
              <ul>
                {result.acceptanceCriteria.map((criterion, index) => (
                  <li key={index}>{criterion}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default UserStoryGenerator;
