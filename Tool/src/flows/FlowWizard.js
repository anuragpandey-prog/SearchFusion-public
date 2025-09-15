import React, { useEffect, useMemo, useState } from 'react';
import API_BASE_URL from '../config';

const endpoints = {
  // BRD
  analyze: `${API_BASE_URL}/brd/analyze-requirement`,
  userStories: `${API_BASE_URL}/brd/user-stories`,
  documentation: `${API_BASE_URL}/brd/documentation`,
  actionPoints: `${API_BASE_URL}/brd/action-points`,
  tasks: `${API_BASE_URL}/brd/tasks`,
  projectPlan: `${API_BASE_URL}/brd/project-plan`,
  functionSpecs: `${API_BASE_URL}/brd/function-specs`,
  useCases: `${API_BASE_URL}/brd/use-cases`,
  // Dev
  sampleDev: `${API_BASE_URL}/dev/sample-dev`,
  testScripts: `${API_BASE_URL}/dev/test-scripts`,
  reviewChecklist: `${API_BASE_URL}/dev/review-checklist`,
  deploymentPlan: `${API_BASE_URL}/dev/deployment-plan`,
  // QA
  traceability: `${API_BASE_URL}/qa/traceability`,
  testReport: `${API_BASE_URL}/qa/test-report`,
  // Integrations
  jiraEnabled: `${API_BASE_URL}/integrations/jira/enabled`,
  jiraCreate: `${API_BASE_URL}/integrations/jira/create-issues`,
  // Files
  extractText: `${API_BASE_URL}/files/extract-text`,
};

const KEY = 'flowWizardState:v1';

function usePersistedState(initial) {
  const [state, setState] = useState(() => {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? JSON.parse(raw) : initial;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {}
  }, [state]);
  return [state, setState];
}

async function postJSON(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Request failed: ${res.status}`);
  }
  return res.json();
}

function Section({ title, description, children, right, collapsible = true }) {
  const storeKey = `section-collapsed:${title}`;
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem(storeKey) === '1'; } catch { return false; }
  });
  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    try { localStorage.setItem(storeKey, next ? '1' : '0'); } catch {}
  };

  return (
    <section className="feature-container">
      <div className="results-header">
        <h2 style={{ borderBottom: 'none', paddingBottom: 0, marginBottom: 0 }}>{title}</h2>
        <div className="btn-row">
          {right}
          {collapsible && (
            <button className="btn-secondary" onClick={toggle}>{collapsed ? 'Show' : 'Hide'}</button>
          )}
        </div>
      </div>
      {!collapsed && (
        <>
          {description && <p className="muted" style={{ marginTop: 8 }}>{description}</p>}
          {children}
        </>
      )}
    </section>
  );
}

export default function FlowWizard() {
  const [state, setState] = usePersistedState({
    projectId: null,
    projectName: '',
    requirement: '',
    status: null,
    brd: {
      analysis: null,
      userStories: null,
      documentation: null,
      actionPoints: null,
      tasks: null,
      projectPlan: null,
      functionSpecs: null,
      useCases: null,
    },
    dev: {
      sampleDev: null,
      testScripts: null,
      reviewChecklist: null,
      deploymentPlan: null,
    },
    qa: {
      traceability: null,
      runs: [],
      testReport: null,
    },
    busy: false,
    error: '',
    jira: { enabled: false, lastCreated: [] },
  });

  // Check Jira integration status on mount
  useEffect(() => {
    let ignore = false;
    (async () => {
      try {
        const res = await fetch(endpoints.jiraEnabled);
        if (!res.ok) return;
        const data = await res.json();
        if (!ignore) setState(s => ({ ...s, jira: { ...s.jira, enabled: !!data.enabled } }));
      } catch {}
    })();
    return () => { ignore = true; };
  }, []);

  // Fetch backend status for readiness and feature visibility
  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const r = await fetch('/api/status');
        if (!r.ok) return;
        const data = await r.json();
        if (!cancel) setState(s => ({ ...s, status: data }));
      } catch {}
    })();
    return () => { cancel = true; };
  }, []);

  const setBusy = (busy) => setState((s) => ({ ...s, busy, error: busy ? '' : s.error }));
  const setError = (error) => setState((s) => ({ ...s, error }));
  const [showAdvanced, setShowAdvanced] = useState(false);

  const canGenerateTests = useMemo(() => {
    return Boolean(state.brd.useCases?.length || state.brd.functionSpecs?.length || state.brd.documentation);
  }, [state]);

  async function runStep(label, fn) {
    try {
      setBusy(true);
      await fn();
    } catch (e) {
      setError(`${label}: ${e.message}`);
    } finally {
      setBusy(false);
    }
  }

  function annotateTestsWithStories(tests, stories) {
    if (!Array.isArray(tests)) return tests;
    const list = [...tests];
    if (!Array.isArray(stories) || stories.length === 0) return list;
    return list.map((t, i) => {
      const sid = stories[i % stories.length]?.id || stories[0]?.id;
      const titled = t.title && t.title.includes(sid) ? t.title : `[${sid}] ${t.title || 'Test'}`;
      return { ...t, title: titled, storyId: sid };
    });
  }

  async function generateAll() {
    if (!state.requirement) {
      alert('Please enter or upload a requirement first.');
      return;
    }
    const ask = (msg) => window.confirm(msg);
    try {
      setBusy(true);
      // BRD
      if (ask('Generate Requirement Analysis?')) {
        await runStep('Analysis', async () => {
          const res = await postJSON(endpoints.analyze, { requirement: state.requirement });
          setState((s) => ({ ...s, brd: { ...s.brd, analysis: res } }));
        });
      }
      if (ask('Generate User Stories?')) {
        await runStep('User Stories', async () => {
          const res = await postJSON(endpoints.userStories, { requirement: state.requirement });
          setState((s) => ({ ...s, brd: { ...s.brd, userStories: res.stories } }));
        });
      }
      if (ask('Generate Documentation?')) {
        await runStep('Documentation', async () => {
          const res = await postJSON(endpoints.documentation, { requirement: state.requirement });
          setState((s) => ({ ...s, brd: { ...s.brd, documentation: res.documentation } }));
        });
      }
      if (ask('Collect Action Points?')) {
        await runStep('Action Points', async () => {
          const res = await postJSON(endpoints.actionPoints, { requirement: state.requirement, documentation: state.brd.documentation });
          setState((s) => ({ ...s, brd: { ...s.brd, actionPoints: res.actionPoints } }));
        });
      }
      if (state.brd.actionPoints && ask('Create Tasks from Action Points?')) {
        await runStep('Tasks', async () => {
          const res = await postJSON(endpoints.tasks, { requirement: state.requirement, actionPoints: state.brd.actionPoints });
          setState((s) => ({ ...s, brd: { ...s.brd, tasks: res.tasks } }));
        });
      }
      if (ask('Generate Project Plan?')) {
        await runStep('Project Plan', async () => {
          const res = await postJSON(endpoints.projectPlan, { requirement: state.requirement });
          setState((s) => ({ ...s, brd: { ...s.brd, projectPlan: res.plan } }));
        });
      }
      if (ask('Create Function Specifications?')) {
        await runStep('Function Specs', async () => {
          const res = await postJSON(endpoints.functionSpecs, { requirement: state.requirement, tasks: state.brd.tasks });
          setState((s) => ({ ...s, brd: { ...s.brd, functionSpecs: res.specs } }));
        });
      }
      if (ask('Prepare Use Cases?')) {
        await runStep('Use Cases', async () => {
          const res = await postJSON(endpoints.useCases, { requirement: state.requirement });
          setState((s) => ({ ...s, brd: { ...s.brd, useCases: res.useCases } }));
        });
      }

      // Development
      if (ask('Create Sample Development (scaffold)?')) {
        await runStep('Sample Development', async () => {
          const res = await postJSON(endpoints.sampleDev, { requirement: state.requirement });
          setState((s) => ({ ...s, dev: { ...s.dev, sampleDev: res.scaffold } }));
        });
      }
      if (ask('Create Test Scripts?')) {
        await runStep('Test Scripts', async () => {
          const res = await postJSON(endpoints.testScripts, { requirement: state.requirement, useCases: state.brd.useCases, userStories: state.brd.userStories });
          const annotated = annotateTestsWithStories(res.tests, state.brd.userStories);
          setState((s) => ({ ...s, dev: { ...s.dev, testScripts: annotated } }));
        });
      }
      if (ask('Generate Code Review Checklist?')) {
        await runStep('Review Checklist', async () => {
          const res = await postJSON(endpoints.reviewChecklist, { stack: 'web: react + node + express' });
          setState((s) => ({ ...s, dev: { ...s.dev, reviewChecklist: res.checklist } }));
        });
      }
      if (ask('Draft Deployment Plan?')) {
        await runStep('Deployment Plan', async () => {
          const res = await postJSON(endpoints.deploymentPlan, { envs: ['dev','staging','prod'], constraints: ['windows dev box', 'node 18+'] });
          setState((s) => ({ ...s, dev: { ...s.dev, deploymentPlan: res.plan } }));
        });
      }

      // QA
      if (state.brd.userStories && state.dev.testScripts && ask('Build Traceability Matrix now?')) {
        await runStep('Traceability', async () => {
          const res = await postJSON(endpoints.traceability, { stories: state.brd.userStories, tests: state.dev.testScripts });
          setState((s) => ({ ...s, qa: { ...s.qa, traceability: res.matrix } }));
        });
      }
      if (state.qa.runs?.length && ask('Generate Test Report from current Runs?')) {
        await runStep('Test Report', async () => {
          const res = await postJSON(endpoints.testReport, { runs: state.qa.runs });
          setState((s) => ({ ...s, qa: { ...s.qa, testReport: res } }));
        });
      }

      // Final offer
      if (ask('Generation complete. Open printable SDLC Pack?')) {
        openPrintablePack();
      }
    } catch (e) {
      // runStep already sets error; this is just a safety net
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  const exportMarkdown = () => {
    const lines = [];
    lines.push(`# SDLC Pack`);
    lines.push('');
    lines.push(`Requirement: ${state.requirement || '(none)'}`);
    lines.push('');
    if (state.brd.documentation) {
      lines.push('## BRD / Documentation');
      lines.push(state.brd.documentation);
      lines.push('');
    }
    if (state.brd.actionPoints?.length) {
      lines.push('## Action Points');
      state.brd.actionPoints.forEach((p, i) => lines.push(`- ${p}`));
      lines.push('');
    }
    if (state.brd.tasks?.length) {
      lines.push('## Tasks');
      state.brd.tasks.forEach((t, i) => lines.push(`- ${t.title}: ${t.description || ''}`));
      lines.push('');
    }
    if (state.brd.projectPlan) {
      lines.push('## Project Plan');
      lines.push('```json');
      lines.push(JSON.stringify(state.brd.projectPlan, null, 2));
      lines.push('```');
      lines.push('');
    }
    if (state.brd.functionSpecs?.length) {
      lines.push('## Function Specifications');
      lines.push('```json');
      lines.push(JSON.stringify(state.brd.functionSpecs, null, 2));
      lines.push('```');
      lines.push('');
    }
    if (state.brd.useCases?.length) {
      lines.push('## Use Cases');
      lines.push('```json');
      lines.push(JSON.stringify(state.brd.useCases, null, 2));
      lines.push('```');
      lines.push('');
    }
    if (state.dev.sampleDev?.files?.length) {
      lines.push('## Sample Development');
      state.dev.sampleDev.files.forEach((f) => {
        lines.push(`### ${f.path}`);
        lines.push('```' + (f.language || '') );
        lines.push(f.contents || '');
        lines.push('```');
      });
      lines.push('');
    }
    if (state.dev.testScripts?.length) {
      lines.push('## Test Scripts');
      state.dev.testScripts.forEach((t) => {
        lines.push(`- ${t.title}`);
        if (t.steps) t.steps.forEach((s) => lines.push(`  - ${s}`));
      });
      lines.push('');
    }
    if (state.dev.reviewChecklist?.length) {
      lines.push('## Code Review Checklist');
      state.dev.reviewChecklist.forEach((c) => lines.push(`- ${c}`));
      lines.push('');
    }
    if (state.dev.deploymentPlan) {
      lines.push('## Deployment Plan');
      lines.push('```json');
      lines.push(JSON.stringify(state.dev.deploymentPlan, null, 2));
      lines.push('```');
      lines.push('');
    }

    const blob = new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'sdlc-pack.md';
    a.click();
    URL.revokeObjectURL(url);
  };

  const openPrintablePack = () => {
    // Reuse exportMarkdown content but display it in a print window
    const lines = [];
    lines.push(`# SDLC Pack`);
    lines.push('');
    lines.push(`Requirement: ${state.requirement || '(none)'}`);
    lines.push('');
    if (state.brd.documentation) { lines.push('## BRD / Documentation'); lines.push(state.brd.documentation); lines.push(''); }
    if (state.brd.actionPoints?.length) { lines.push('## Action Points'); state.brd.actionPoints.forEach(p=>lines.push(`- ${p}`)); lines.push(''); }
    if (state.brd.tasks?.length) { lines.push('## Tasks'); state.brd.tasks.forEach(t=>lines.push(`- ${t.title}: ${t.description||''}`)); lines.push(''); }
    if (state.brd.projectPlan) { lines.push('## Project Plan'); lines.push('```json'); lines.push(JSON.stringify(state.brd.projectPlan, null, 2)); lines.push('```'); lines.push(''); }
    if (state.brd.functionSpecs?.length) { lines.push('## Function Specifications'); lines.push('```json'); lines.push(JSON.stringify(state.brd.functionSpecs, null, 2)); lines.push('```'); lines.push(''); }
    if (state.brd.useCases?.length) { lines.push('## Use Cases'); lines.push('```json'); lines.push(JSON.stringify(state.brd.useCases, null, 2)); lines.push('```'); lines.push(''); }
    if (state.dev.sampleDev?.files?.length) { lines.push('## Sample Development'); state.dev.sampleDev.files.forEach(f=>{ lines.push(`### ${f.path}`); lines.push('```'+(f.language||'')); lines.push(f.contents||''); lines.push('```'); }); lines.push(''); }
    if (state.dev.testScripts?.length) { lines.push('## Test Scripts'); state.dev.testScripts.forEach(t=>{ lines.push(`- ${t.title}`); if (t.steps) t.steps.forEach(s=>lines.push(`  - ${s}`)); }); lines.push(''); }
    if (state.dev.reviewChecklist?.length) { lines.push('## Code Review Checklist'); state.dev.reviewChecklist.forEach(c=>lines.push(`- ${c}`)); lines.push(''); }
    if (state.dev.deploymentPlan) { lines.push('## Deployment Plan'); lines.push('```json'); lines.push(JSON.stringify(state.dev.deploymentPlan, null, 2)); lines.push('```'); lines.push(''); }
    const markdown = lines.join('\n');
    const win = window.open('', '_blank');
    if (!win) return;
    const safe = markdown.replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
    win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>SDLC Pack</title>
      <style>body{font-family:Arial,Helvetica,sans-serif;padding:24px;} pre{white-space:pre-wrap;background:#f5f5f5;padding:12px;border-radius:6px;}</style>
      </head><body><h1>SDLC Pack</h1><pre>${safe}</pre><script>window.onload=()=>window.print()</script></body></html>`);
    win.document.close();
  };

  function exportCSV(filename, headers, rows) {
    const csv = [headers].concat(rows).map(r => r.map(v => '"'+String(v ?? '').replace(/"/g,'""')+'"').join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url);
  }

  function exportTasksCSV(tasks){
    const rows = (tasks||[]).map(t=>[t.title||'', t.description||'', t.priority||'', (t.dependencies||[]).join(' | ')]);
    exportCSV('tasks.csv', ['title','description','priority','dependencies'], rows);
  }
  function exportActionPointsCSV(points){ exportCSV('action-points.csv', ['actionPoint'], (points||[]).map(p=>[p])); }
  function exportUserStoriesCSV(stories){
    const rows = (stories||[]).flatMap(s=> (s.acceptanceCriteria||['']).map(ac=>[s.id||'', s.title||'', s.userStory||'', ac||'']));
    exportCSV('user-stories.csv', ['id','title','userStory','acceptanceCriterion'], rows);
  }
  function exportTestsCSV(tests){
    const rows = (tests||[]).flatMap(t=> (t.steps||['']).map(step=>[t.storyId||'', t.title||'', step||'', t.expected||'']));
    exportCSV('tests.csv', ['storyId','title','step','expected'], rows);
  }
  function exportRunsCSV(runs){ exportCSV('test-runs.csv', ['title','status','notes'], (runs||[]).map(r=>[r.title||'', r.status||'', r.notes||''])); }

  function tasksPriorityCounts(tasks){
    const counts = { P0:0, P1:0, P2:0 };
    (tasks||[]).forEach(t=>{ const p = t.priority||'P2'; if(counts[p]===undefined) counts[p]=0; counts[p]++; });
    return counts;
  }

  function coverageFromMatrix(matrix){
    const acTotal = (matrix||[]).reduce((sum,row)=> sum + (row.acceptanceCriteria?.length||0), 0);
    const testLinked = (matrix||[]).reduce((sum,row)=> sum + (row.tests?.length||0), 0);
    const pct = acTotal ? Math.min(100, Math.round((testLinked/acTotal)*100)) : 0;
    return { acTotal, testLinked, pct };
  }

  return (
    <div>
      {state.busy && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.35)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:9999}}>
          <div style={{background:'#fff',padding:16,borderRadius:8,boxShadow:'0 4px 12px rgba(0,0,0,0.2)'}}>
            <div className="spinner" />
            <span style={{marginLeft:8}}>Working on your SDLC pack…</span>
          </div>
        </div>
      )}
      {state.status && (
        <section className="feature-container" style={{marginBottom:16}}>
          <div className="results-header">
            <h2 style={{borderBottom:'none',margin:0}}>Environment</h2>
          </div>
          <div className="btn-row" style={{marginTop:8,flexWrap:'wrap'}}>
            <Badge ok={state.status.azure?.configured} label="Azure" />
            <Badge ok={state.jira.enabled} label="Jira" />
            <Badge ok={state.status.features?.uploadAvailable} label="Upload" />
            <Badge ok={state.status.features?.zipExportAvailable} label="ZIP Export" />
            <span className="muted">Rate limit: {state.status.rateLimit?.max || 120}/{Math.round((state.status.rateLimit?.windowMs||60000)/1000)}s</span>
          </div>
        </section>
      )}
      <ProjectToolbar state={state} setState={setState} />
      <Section
        title="SDLC Flow Wizard"
        description="Follow the flow from requirement to BRD and development artifacts. Your progress is saved locally."
        right={<>
          <button onClick={generateAll} disabled={state.busy}>
            {state.busy ? 'Generating…' : 'Generate SDLC Pack'}
          </button>
          <button className="copy-btn" onClick={exportMarkdown}>Export Markdown</button>
          <button className="btn-secondary" onClick={openPrintablePack}>Open Printable</button>
          <button className="btn-secondary" onClick={()=>setShowAdvanced(a=>!a)}>{showAdvanced ? 'Hide Advanced' : 'Show Advanced'}</button>
        </>}
      >
        <label htmlFor="req" className="muted">Business Requirement</label>
        <textarea id="req" value={state.requirement} onChange={(e)=>setState(s=>({...s, requirement:e.target.value}))} placeholder="e.g., Users can sign up and log in via email/password, with 2FA support." disabled={state.busy} />
        <div className="btn-row" style={{marginTop:8}}>
          <label className="muted">Upload requirement file (.txt/.md/.json):
            <input type="file" accept=".txt,.md,.json,text/plain,text/markdown,application/json" style={{ marginLeft: 8 }} onChange={async (e)=>{
              const file = e.target.files && e.target.files[0];
              if (!file) return;
              try {
                setBusy(true);
                const fd = new FormData();
                fd.append('file', file);
                const resp = await fetch(endpoints.extractText, { method: 'POST', body: fd });
                const data = await resp.json();
                if (!resp.ok) throw new Error(data.error || 'Upload failed');
                setState(s=>({ ...s, requirement: (s.requirement? s.requirement+'\n\n' : '') + data.text }));
              } catch (err) {
                setError(`Upload: ${err.message}`);
              } finally {
                setBusy(false);
                e.target.value = '';
              }
            }} />
          </label>
        </div>
        <div className="btn-row">
          <span className="muted">{(state.requirement||'').length} characters</span>
          {state.error && <span className="alert" role="alert" style={{marginLeft:8}}>{state.error}</span>}
        </div>
      </Section>

      {/* BRD Track */}
      <Section title="BRD / Requirement" description="Analyze requirement, generate stories and comprehensive BRD artifacts.">
        {showAdvanced && <div className="btn-row" style={{marginBottom:12}}>
          <button disabled={!state.requirement || state.busy} onClick={()=>runStep('Analysis', async()=>{
            const res = await postJSON(endpoints.analyze, { requirement: state.requirement });
            setState(s=>({ ...s, brd: { ...s.brd, analysis: res } }));
          })}>{state.busy ? <><span className="spinner"/>Analyzing...</> : 'Analyze Requirement'}</button>
          <button disabled={!state.requirement || state.busy} onClick={()=>runStep('User Stories', async()=>{
            const res = await postJSON(endpoints.userStories, { requirement: state.requirement });
            setState(s=>({ ...s, brd: { ...s.brd, userStories: res.stories } }));
          })}>{state.busy ? <><span className="spinner"/>Generating stories...</> : 'Generate User Stories'}</button>
        </div>}
        {showAdvanced && <div className="btn-row" style={{marginBottom:12}}>
          <button disabled={!state.requirement || state.busy} onClick={()=>runStep('Documentation', async()=>{
            const res = await postJSON(endpoints.documentation, { requirement: state.requirement });
            setState(s=>({ ...s, brd: { ...s.brd, documentation: res.documentation } }));
          })}>{state.busy ? <><span className="spinner"/>Generating documentation...</> : 'Generate Documentation'}</button>
          <button disabled={state.busy || !(state.brd.documentation || state.requirement)} onClick={()=>runStep('Action Points', async()=>{
            const res = await postJSON(endpoints.actionPoints, { requirement: state.requirement, documentation: state.brd.documentation });
            setState(s=>({ ...s, brd: { ...s.brd, actionPoints: res.actionPoints } }));
          })}>{state.busy ? <><span className="spinner"/>Collecting...</> : 'Collect Action Points'}</button>
          <button disabled={state.busy || !state.brd.actionPoints} onClick={()=>runStep('Tasks', async()=>{
            const res = await postJSON(endpoints.tasks, { requirement: state.requirement, actionPoints: state.brd.actionPoints });
            setState(s=>({ ...s, brd: { ...s.brd, tasks: res.tasks } }));
          })}>{state.busy ? <><span className="spinner"/>Creating tasks...</> : 'Create Tasks'}</button>
          {state.jira.enabled && (state.brd.tasks?.length>0) && (
            <button disabled={state.busy} onClick={()=>runStep('Jira Issues', async()=>{
              const created = await postJSON(endpoints.jiraCreate, { tasks: state.brd.tasks });
              setState(s=>({ ...s, jira: { ...s.jira, lastCreated: created.created || [] } }));
            })}>Create Jira Issues</button>
          )}
        </div>}
        {showAdvanced && <div className="btn-row">
          <button disabled={state.busy || !state.requirement} onClick={()=>runStep('Project Plan', async()=>{
            const res = await postJSON(endpoints.projectPlan, { requirement: state.requirement });
            setState(s=>({ ...s, brd: { ...s.brd, projectPlan: res.plan } }));
          })}>{state.busy ? <><span className="spinner"/>Planning...</> : 'Generate Project Plan'}</button>
          <button disabled={state.busy || !(state.brd.tasks || state.requirement)} onClick={()=>runStep('Function Specs', async()=>{
            const res = await postJSON(endpoints.functionSpecs, { requirement: state.requirement, tasks: state.brd.tasks });
            setState(s=>({ ...s, brd: { ...s.brd, functionSpecs: res.specs } }));
          })}>{state.busy ? <><span className="spinner"/>Specifying...</> : 'Create Function Specs'}</button>
          <button disabled={state.busy || !state.requirement} onClick={()=>runStep('Use Cases', async()=>{
            const res = await postJSON(endpoints.useCases, { requirement: state.requirement });
            setState(s=>({ ...s, brd: { ...s.brd, useCases: res.useCases } }));
          })}>{state.busy ? <><span className="spinner"/>Preparing use cases...</> : 'Prepare Use Cases'}</button>
        </div>}

        {(state.brd.analysis || state.brd.userStories || state.brd.documentation || state.brd.actionPoints || state.brd.tasks || state.brd.projectPlan || state.brd.functionSpecs || state.brd.useCases) && (
          <div className="results" style={{marginTop:12}}>
            <h3>BRD Outputs</h3>
            {state.brd.analysis && <>
              <h4>Requirement Analysis</h4>
              <pre>{JSON.stringify(state.brd.analysis, null, 2)}</pre>
            </>}
            {state.brd.userStories?.length>0 && <>
              <h4>User Stories</h4>
              <div className="btn-row" style={{margin:'6px 0'}}>
                <button className="copy-btn" onClick={()=>exportUserStoriesCSV(state.brd.userStories)}>Export CSV</button>
              </div>
              <ul>{state.brd.userStories.map((u)=> <li key={u.id}><strong>{u.id}</strong> — {u.title}</li>)}</ul>
            </>}
            {state.brd.documentation && <>
              <h4>Documentation</h4>
              <pre>{state.brd.documentation}</pre>
            </>}
            {state.brd.actionPoints?.length>0 && <>
              <h4>Action Points</h4>
              <div className="btn-row" style={{margin:'6px 0'}}>
                <button className="copy-btn" onClick={()=>exportActionPointsCSV(state.brd.actionPoints)}>Export CSV</button>
              </div>
              <ul>{state.brd.actionPoints.map((a,i)=><li key={i}>{a}</li>)}</ul>
            </>}
            {state.brd.tasks?.length>0 && <>
              <h4>Tasks</h4>
              <div className="btn-row" style={{margin:'6px 0'}}>
                <button className="copy-btn" onClick={()=>exportTasksCSV(state.brd.tasks)}>Export CSV</button>
              </div>
              <ul>{state.brd.tasks.map((t,i)=><li key={i}><strong>{t.title}</strong>{t.description?`: ${t.description}`:''}</li>)}</ul>
              {/* Priority distribution bar */}
              {(()=>{ const c=tasksPriorityCounts(state.brd.tasks); const total=(c.P0+c.P1+c.P2)||1; const p0=Math.round(c.P0/total*100),p1=Math.round(c.P1/total*100),p2=Math.round(c.P2/total*100); return (
                <div className="muted" style={{marginTop:6}}>
                  <div style={{display:'flex',height:12,borderRadius:6,overflow:'hidden',background:'#eee'}}>
                    <div style={{width:`${p0}%`,background:'#e74c3c'}} title={`P0 ${c.P0}`} />
                    <div style={{width:`${p1}%`,background:'#f1c40f'}} title={`P1 ${c.P1}`} />
                    <div style={{width:`${p2}%`,background:'#3498db'}} title={`P2 ${c.P2}`} />
                  </div>
                  <div style={{display:'flex',gap:12,marginTop:6}}>
                    <span>P0: {c.P0}</span>
                    <span>P1: {c.P1}</span>
                    <span>P2: {c.P2}</span>
                  </div>
                </div>
              ); })()}
            </>}
            {state.brd.projectPlan && <>
              <h4>Project Plan</h4>
              {Array.isArray(state.brd.projectPlan.milestones) && state.brd.projectPlan.milestones.length>0 && (
                <>
                  <h5>Milestones</h5>
                  <Table
                    columns={[
                      { header:'Name', value:(m)=>m.name },
                      { header:'Owner', value:(m)=>m.owner },
                      { header:'Estimate', value:(m)=>m.estimate },
                      { header:'Description', value:(m)=>m.description },
                    ]}
                    rows={state.brd.projectPlan.milestones}
                  />
                </>
              )}
              {Array.isArray(state.brd.projectPlan.timeline) && state.brd.projectPlan.timeline.length>0 && (
                <>
                  <h5>Timeline</h5>
                  <Table
                    columns={[
                      { header:'Phase', value:(t)=>t.phase },
                      { header:'Start', value:(t)=>t.start },
                      { header:'End', value:(t)=>t.end },
                    ]}
                    rows={state.brd.projectPlan.timeline}
                  />
                </>
              )}
            </>}
            {state.brd.functionSpecs && <>
              <h4>Function Specs</h4>
              <Table
                columns={[
                  { header:'User Story', value:(s)=>s.userStory },
                  { header:'Inputs', value:(s)=> (s.inputs||[]).join(', ') },
                  { header:'Outputs', value:(s)=> (s.outputs||[]).join(', ') },
                  { header:'AC', value:(s)=> (s.acceptanceCriteria||[]).length, className:'num' },
                ]}
                rows={state.brd.functionSpecs}
              />
            </>}
            {state.brd.useCases && <>
              <h4>Use Cases</h4>
              <Table
                columns={[
                  { header:'Title', value:(u)=>u.title },
                  { header:'Actors', value:(u)=> (u.actors||[]).join(', ') },
                  { header:'Basic Steps', value:(u)=> (u.basicFlow||[]).length, className:'num' },
                  { header:'Alternate', value:(u)=> (u.alternateFlows||[]).length, className:'num' },
                ]}
                rows={state.brd.useCases}
              />
            </>}
          </div>
        )}
      </Section>

      {/* Development Track */}
      <Section title="Development" description="Generate sample code, test scripts, review checklist and deployment plan.">
        {showAdvanced && <div className="btn-row" style={{marginBottom:12}}>
          <button disabled={state.busy || !state.requirement} onClick={()=>runStep('Sample Development', async()=>{
            const res = await postJSON(endpoints.sampleDev, { requirement: state.requirement });
            setState(s=>({ ...s, dev: { ...s.dev, sampleDev: res.scaffold } }));
          })}>{state.busy ? <><span className="spinner"/>Scaffolding...</> : 'Create Sample Development'}</button>
          <button disabled={state.busy || !canGenerateTests} onClick={()=>runStep('Test Scripts', async()=>{
            const res = await postJSON(endpoints.testScripts, { requirement: state.requirement, useCases: state.brd.useCases, userStories: state.brd.userStories });
            const annotated = annotateTestsWithStories(res.tests, state.brd.userStories);
            setState(s=>({ ...s, dev: { ...s.dev, testScripts: annotated } }));
          })}>{state.busy ? <><span className="spinner"/>Generating tests...</> : 'Create Test Scripts'}</button>
          <button disabled={state.busy} onClick={()=>runStep('Review Checklist', async()=>{
            const res = await postJSON(endpoints.reviewChecklist, { stack: 'web: react + node + express' });
            setState(s=>({ ...s, dev: { ...s.dev, reviewChecklist: res.checklist } }));
          })}>{state.busy ? <><span className="spinner"/>Compiling checklist...</> : 'Code Review Checklist'}</button>
          <button disabled={state.busy || !state.requirement} onClick={()=>runStep('Deployment Plan', async()=>{
            const res = await postJSON(endpoints.deploymentPlan, { envs: ['dev','staging','prod'], constraints: ['windows dev box', 'node 18+'] });
            setState(s=>({ ...s, dev: { ...s.dev, deploymentPlan: res.plan } }));
          })}>{state.busy ? <><span className="spinner"/>Drafting plan...</> : 'Update Deployment Plan'}</button>
        </div>}

        {(state.dev.sampleDev || state.dev.testScripts || state.dev.reviewChecklist || state.dev.deploymentPlan) && (
          <div className="results">
            <h3>Development Outputs</h3>
            {state.dev.sampleDev?.files?.length>0 && <>
              <h4>Scaffold Files</h4>
              {state.dev.sampleDev.files.map((f, i) => (
                <details key={i} style={{marginBottom:8}}>
                  <summary><code>{f.path}</code></summary>
                  <pre>{f.contents}</pre>
                </details>
              ))}
            </>}
            {state.dev.testScripts?.length>0 && <>
              <h4>Test Scripts</h4>
              <div className="btn-row" style={{margin:'6px 0'}}>
                <button className="copy-btn" onClick={()=>exportTestsCSV(state.dev.testScripts)}>Export CSV</button>
              </div>
              <Table
                columns={[
                  { header:'Story', value:(t)=>t.storyId || '' },
                  { header:'Title', value:(t)=>t.title },
                  { header:'Steps', value:(t)=> (t.steps||[]).length, className:'num' },
                  { header:'Expected', value:(t)=> t.expected ? 'Yes' : '—' },
                ]}
                rows={state.dev.testScripts}
              />
            </>}
            {state.dev.reviewChecklist?.length>0 && <>
              <h4>Code Review Checklist</h4>
              <ul>{state.dev.reviewChecklist.map((c,i)=><li key={i}>{c}</li>)}</ul>
            </>}
            {state.dev.deploymentPlan && <>
              <h4>Deployment Plan</h4>
              <pre>{JSON.stringify(state.dev.deploymentPlan, null, 2)}</pre>
            </>}
          </div>
        )}
      </Section>

      {/* QA & Traceability */}
      <Section title="Testing & Traceability" description="Link user stories to tests and generate execution report.">
        {showAdvanced && <div className="btn-row" style={{marginBottom:12}}>
          <button disabled={state.busy || !(state.brd.userStories && state.dev.testScripts)} onClick={()=>runStep('Traceability', async()=>{
            const res = await postJSON(endpoints.traceability, { stories: state.brd.userStories, tests: state.dev.testScripts });
            setState(s=>({ ...s, qa: { ...s.qa, traceability: res.matrix } }));
          })}>{state.busy ? <><span className="spinner"/>Mapping...</> : 'Build Traceability Matrix'}</button>
          <button disabled={state.busy || !state.qa.runs} onClick={()=>runStep('Test Report', async()=>{
            const res = await postJSON(endpoints.testReport, { runs: state.qa.runs });
            setState(s=>({ ...s, qa: { ...s.qa, testReport: res } }));
          })}>{state.busy ? <><span className="spinner"/>Summarizing...</> : 'Generate Test Report'}</button>
          <button disabled={!state.qa.traceability} className="btn-secondary" onClick={()=>exportTraceabilityCSV(state.qa.traceability)}>Export Traceability CSV</button>
          <button disabled={!state.qa.testReport} className="btn-secondary" onClick={()=>openPrintableReport(state.qa.testReport?.reportMarkdown)}>Open Printable Report</button>
        </div>}
        <div className="results">
          {state.qa.traceability && <>
            <h4>Traceability Matrix</h4>
            <Table
              columns={[
                { header:'Story', value:(r)=>r.storyId },
                { header:'AC', value:(r)=> (r.acceptanceCriteria||[]).length, className:'num' },
                { header:'Tests', value:(r)=> (r.tests||[]).length, className:'num' },
                { header:'Coverage', value:(r)=> {
                  const ac=(r.acceptanceCriteria||[]).length; const t=(r.tests||[]).length; const pct = ac? Math.min(100, Math.round((t/ac)*100)) : 0;
                  const tone = pct>=100? 'success' : pct>=60? 'info' : pct>0? 'warn' : 'danger';
                  return <span className={`chip ${tone}`}>{pct}%</span>;
                } },
              ]}
              rows={state.qa.traceability}
            />
            {(() => { const cov = coverageFromMatrix(state.qa.traceability); return (
              <div className="muted" style={{marginTop:6}}>
                <div style={{display:'flex',height:12,borderRadius:6,overflow:'hidden',background:'#eee'}}>
                  <div style={{width:`${cov.pct}%`,background:'#2ecc71'}} title={`Coverage ${cov.pct}%`} />
                </div>
                <div style={{display:'flex',gap:12,marginTop:6}}>
                  <span>AC Total: {cov.acTotal}</span>
                  <span>Tests Linked: {cov.testLinked}</span>
                  <span>Coverage: {cov.pct}%</span>
                </div>
              </div>
            ); })()}
          </>}
          <h4>Test Run Capture</h4>
          <RunEditor runs={state.qa.runs} onChange={(runs)=>setState(s=>({ ...s, qa: { ...s.qa, runs } }))} />
          {state.qa.testReport && <>
            <h4>Execution Summary</h4>
            <pre>{JSON.stringify(state.qa.testReport.summary, null, 2)}</pre>
            <h4>Report (Markdown)</h4>
            <pre>{state.qa.testReport.reportMarkdown}</pre>
            <SummaryBar summary={state.qa.testReport.summary} />
            <div className="btn-row" style={{marginTop:6}}>
              <button className="copy-btn" onClick={()=>exportRunsCSV(state.qa.runs)}>Export Runs CSV</button>
            </div>
          </>}
        </div>
      </Section>
    </div>
  );
}

function Badge({ ok, label }) {
  return (
    <span style={{display:'inline-flex',alignItems:'center',gap:6,padding:'4px 8px',borderRadius:999,background: ok ? '#eafaf1' : '#fbeaea',border: `1px solid ${ok ? '#2ecc71' : '#e74c3c'}`, color: ok ? '#2c7a4b' : '#b23b3b'}}>
      <span style={{width:8,height:8,borderRadius:'50%',background: ok ? '#2ecc71' : '#e74c3c'}} /> {label}
    </span>
  );
}

function RunEditor({ runs, onChange }) {
  const [title, setTitle] = useState('');
  const [status, setStatus] = useState('passed');
  const [notes, setNotes] = useState('');
  const add = () => {
    if (!title) return;
    onChange([...(runs||[]), { title, status, notes }]);
    setTitle(''); setStatus('passed'); setNotes('');
  };
  const remove = (idx) => {
    const copy = [...(runs||[])];
    copy.splice(idx,1);
    onChange(copy);
  };
  return (
    <div>
      <div className="btn-row" style={{marginBottom:8}}>
        <input placeholder="Test title" value={title} onChange={(e)=>setTitle(e.target.value)} />
        <select value={status} onChange={(e)=>setStatus(e.target.value)}>
          <option value="passed">passed</option>
          <option value="failed">failed</option>
          <option value="skipped">skipped</option>
        </select>
        <input placeholder="Notes" value={notes} onChange={(e)=>setNotes(e.target.value)} style={{flex:1}} />
        <button onClick={add}>Add</button>
      </div>
      {(runs||[]).length>0 && (
        <ul>
          {runs.map((r,i)=> (
            <li key={i}><strong>{r.title}</strong> — {r.status}{r.notes?`: ${r.notes}`:''} <button className="btn-secondary" onClick={()=>remove(i)}>Remove</button></li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ProjectToolbar({ state, setState }) {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState('');

  const refresh = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/projects');
      if (!res.ok) return;
      const data = await res.json();
      setProjects(data.projects || []);
    } finally { setLoading(false); }
  };

  useEffect(()=>{ refresh(); }, []);

  const save = async () => {
    try {
      setLoading(true);
      const payload = { name: state.projectName || 'Untitled Project', data: state };
      if (!state.projectId) {
        const res = await fetch('/api/projects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        const data = await res.json();
        setState(s=>({ ...s, projectId: data.id }));
      } else {
        await fetch(`/api/projects/${state.projectId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      }
      await refresh();
    } finally { setLoading(false); }
  };

  const load = async (id) => {
    if (!id) return;
    const res = await fetch(`/api/projects/${id}`);
    const data = await res.json();
    if (data?.data) {
      setState({ ...data.data, projectId: data.id, projectName: data.name });
    }
  };

  const doExportZip = async () => {
    // Build markdown + json + csv bundle from current state
    const mdBtn = document.createElement('button');
    // reuse render logic
    const mkLines = [];
    mkLines.push(`# SDLC Pack`,'',`Requirement: ${state.requirement||'(none)'}`,'');
    if (state.brd?.documentation) mkLines.push('## BRD / Documentation', state.brd.documentation, '');
    if (state.brd?.actionPoints?.length) { mkLines.push('## Action Points'); state.brd.actionPoints.forEach(p=>mkLines.push(`- ${p}`)); mkLines.push(''); }
    if (state.brd?.tasks?.length) { mkLines.push('## Tasks'); state.brd.tasks.forEach(t=>mkLines.push(`- ${t.title}: ${t.description||''}`)); mkLines.push(''); }
    if (state.brd?.projectPlan) { mkLines.push('## Project Plan','```json', JSON.stringify(state.brd.projectPlan,null,2),'```',''); }
    if (state.brd?.functionSpecs?.length) { mkLines.push('## Function Specifications','```json', JSON.stringify(state.brd.functionSpecs,null,2),'```',''); }
    if (state.brd?.useCases?.length) { mkLines.push('## Use Cases','```json', JSON.stringify(state.brd.useCases,null,2),'```',''); }
    if (state.dev?.sampleDev?.files?.length) { mkLines.push('## Sample Development'); state.dev.sampleDev.files.forEach(f=>{ mkLines.push(`### ${f.path}`,'```'+(f.language||''),f.contents||'','```');}); mkLines.push(''); }
    if (state.dev?.testScripts?.length) { mkLines.push('## Test Scripts'); state.dev.testScripts.forEach(t=>{ mkLines.push(`- ${t.title}`); (t.steps||[]).forEach(s=>mkLines.push(`  - ${s}`));}); mkLines.push(''); }
    if (state.dev?.reviewChecklist?.length) { mkLines.push('## Code Review Checklist'); state.dev.reviewChecklist.forEach(c=>mkLines.push(`- ${c}`)); mkLines.push(''); }
    if (state.dev?.deploymentPlan) { mkLines.push('## Deployment Plan','```json', JSON.stringify(state.dev.deploymentPlan,null,2),'```',''); }
    const markdown = mkLines.join('\n');

    const csv = {};
    const csvJoin = (rows) => rows.map(r=> r.map(v=>'"'+String(v??'').replace(/"/g,'""')+'"').join(',')).join('\n');
    if (state.brd?.userStories) {
      const rows = [['id','title','userStory','acceptanceCriterion']];
      state.brd.userStories.forEach(s=> (s.acceptanceCriteria||['']).forEach(ac=> rows.push([s.id||'',s.title||'',s.userStory||'',ac||''])));
      csv['user-stories'] = csvJoin(rows);
    }
    if (state.brd?.actionPoints) { csv['action-points'] = csvJoin([['actionPoint'], ...state.brd.actionPoints.map(p=>[p])]); }
    if (state.brd?.tasks) { csv['tasks'] = csvJoin([['title','description','priority','dependencies'], ...state.brd.tasks.map(t=>[t.title||'',t.description||'',t.priority||'',(t.dependencies||[]).join(' | ')])]); }
    if (state.dev?.testScripts) { csv['tests'] = csvJoin([['storyId','title','step','expected'], ...state.dev.testScripts.flatMap(t=> (t.steps||['']).map(step=>[t.storyId||'',t.title||'',step||'',t.expected||'']))]); }
    if (state.qa?.traceability) { csv['traceability'] = csvJoin([['storyId','acceptanceCriterion','testTitle'], ...state.qa.traceability.flatMap(row=>{ const sid=row.storyId||''; const ac=row.acceptanceCriteria||['']; const tests=row.tests||['']; const m=Math.max(ac.length,tests.length); return Array.from({length:m}).map((_,i)=>[sid,ac[i]||'',tests[i]||'']); })]); }
    if (state.qa?.runs) { csv['test-runs'] = csvJoin([['title','status','notes'], ...(state.qa.runs||[]).map(r=>[r.title||'',r.status||'',r.notes||''])]); }

    const payload = { name: (state.projectName||'sdlc-pack'), markdown, json: state, csv };
    const res = await fetch('/api/export/pack', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `${payload.name}.zip`; a.click(); URL.revokeObjectURL(url);
  };

  return (
    <section className="feature-container" style={{marginBottom:16}}>
      <div className="results-header">
        <h2 style={{ borderBottom:'none', marginBottom:0 }}>Project</h2>
        <div className="btn-row">
          <button className="copy-btn" onClick={refresh}>{loading ? 'Refreshing...' : 'Refresh'}</button>
          <button className="copy-btn" onClick={save}>{state.projectId ? 'Save' : 'Create & Save'}</button>
          <button className="btn-secondary" onClick={doExportZip}>Export ZIP</button>
        </div>
      </div>
      <div className="btn-row" style={{marginTop:8}}>
        <input placeholder="Project name" value={state.projectName||''} onChange={(e)=>setState(s=>({ ...s, projectName: e.target.value }))} />
        <select value={state.projectId||''} onChange={(e)=>load(e.target.value)}>
          <option value="">Load project...</option>
          {projects.map(p=> <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        {state.projectId && <span className="muted">ID: {state.projectId}</span>}
      </div>
    </section>
  );
}

function exportTraceabilityCSV(matrix) {
  // rows: storyId, acceptanceCriterion, testTitle
  const rows = [['storyId','acceptanceCriterion','testTitle']];
  (matrix||[]).forEach(row => {
    const sid = row.storyId || '';
    const acList = row.acceptanceCriteria || [''];
    const tests = row.tests || [''];
    const max = Math.max(acList.length, tests.length);
    for (let i=0;i<max;i++) {
      rows.push([sid, acList[i]||'', tests[i]||'']);
    }
  });
  const csv = rows.map(r => r.map(v => '"' + String(v).replace(/"/g,'""') + '"').join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'traceability.csv'; a.click();
  URL.revokeObjectURL(url);
}

function openPrintableReport(markdown) {
  const win = window.open('', '_blank');
  if (!win) return;
  const safe = (markdown||'').replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
  win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Test Report</title>
    <style>body{font-family:Arial,Helvetica,sans-serif;padding:24px;}
    pre{white-space:pre-wrap;background:#f5f5f5;padding:12px;border-radius:6px;}
    .summary{margin:12px 0;padding:8px;border:1px solid #ddd;border-radius:6px;}
    </style></head><body><h1>Test Report</h1><pre>${safe}</pre><script>window.onload=()=>window.print()</script></body></html>`);
  win.document.close();
}

function SummaryBar({ summary }) {
  if (!summary) return null;
  const total = (summary.passed||0) + (summary.failed||0) + (summary.skipped||0);
  const pct = (n) => total ? Math.round((n/total)*100) : 0;
  const p = pct(summary.passed||0), f=pct(summary.failed||0), s=pct(summary.skipped||0);
  return (
    <div className="muted" style={{marginTop:8}}>
      <div style={{display:'flex',height:12,borderRadius:6,overflow:'hidden',background:'#eee'}}>
        <div style={{width:`${p}%`,background:'#2ecc71'}} title={`Passed ${p}%`} />
        <div style={{width:`${f}%`,background:'#e74c3c'}} title={`Failed ${f}%`} />
        <div style={{width:`${s}%`,background:'#f1c40f'}} title={`Skipped ${s}%`} />
      </div>
      <div style={{display:'flex',gap:12,marginTop:6}}>
        <span>Passed: {summary.passed||0}</span>
        <span>Failed: {summary.failed||0}</span>
        <span>Skipped: {summary.skipped||0}</span>
        <span>Total: {total}</span>
      </div>
    </div>
  );
}

// Generic table component for clean presentation
function Table({ columns, rows }) {
  return (
    <table className="table">
      <thead>
        <tr>
          {columns.map((c, i) => (<th key={i}>{c.header}</th>))}
        </tr>
      </thead>
      <tbody>
        {(rows||[]).map((r, ri) => (
          <tr key={ri}>
            {columns.map((c, ci) => {
              const content = c.render ? c.render(r) : (typeof c.value === 'function' ? c.value(r) : r[c.value]);
              const cls = c.className || '';
              return <td key={ci} className={cls}>{content}</td>;
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function priorityClass(p) {
  const v = (p||'P2').toUpperCase();
  if (v === 'P0') return 'p0';
  if (v === 'P1') return 'p1';
  return 'p2';
}
