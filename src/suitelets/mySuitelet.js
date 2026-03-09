/**
 * SearchFusion v3 — Full ETL Engine
 *
 * New in v3:
 *   MERGE ENGINE  — APPEND (stack) or JOIN (horizontal merge on shared key)
 *                   per-source: PRIMARY / LEFT JOIN / INNER JOIN / APPEND
 *                   multi-match: FIRST / CONCAT / SUM / LAST
 *   COMPUTED COLS — formula expressions: {col_a} - {col_b}, IF(...), CONCAT(...)
 *   FLAG RULES    — condition expressions that tag rows; appear in Flags sheet
 *   MULTI-SHEET   — Merged + Summary + Flags + per-source raw sheets
 *   PIVOT         — group-by + aggregate summaries stored per report
 *
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 */
define(['N/runtime','N/search','N/record','N/task','N/file','N/log','N/https'],
function(runtime, search, record, task, file, log, https) {

  /* ══ Record types ══════════════════════════════════════════════════════════ */
  var RECORDS = {
    REPORT:   'customrecord_sf_report',   SOURCE:   'customrecord_sf_source',
    COLUMN:   'customrecord_sf_column',   MAPPING:  'customrecord_sf_mapping',
    RUN:      'customrecord_sf_run',      FLAG:     'customrecord_sf_flag',
    PIVOT:    'customrecord_sf_pivot',    DEDUPE:   'customrecord_sf_dedupe',
    SCHEDULE: 'customrecord_sf_schedule'
  };

  /* ══ Field IDs ══════════════════════════════════════════════════════════════ */
  var F = {
    // Report
    R_DESC:  'custrecord_sf_r_description', R_TAGS:  'custrecord_sf_r_tags',
    R_MERGE: 'custrecord_sf_r_merge_mode',  R_JSEP:  'custrecord_sf_r_join_sep',
    R_SORT:  'custrecord_sf_r_sort_keys',   R_DEDUP: 'custrecord_sf_r_dedupe_key',
    R_CAP:   'custrecord_sf_r_preview_cap', R_OUT:   'custrecord_sf_r_default_output',
    R_AI:    'custrecord_sf_r_ai_enabled',  R_WB:    'custrecord_sf_r_workbook_id',
    R_STS:   'custrecord_sf_r_status',      R_CAT:   'custrecord_sf_r_category',
    R_LRUN:  'custrecord_sf_r_last_run',    R_LROWS: 'custrecord_sf_r_last_rows',
    R_MKEY:  'custrecord_sf_r_merge_key',   // free-form text field for SMART merge key
    // Source
    S_RPT:   'custrecord_sf_s_report',      S_SSID:  'custrecord_sf_s_ss_id',
    S_NAME:  'custrecord_sf_s_name',        S_CAT:   'custrecord_sf_s_category',
    S_EN:    'custrecord_sf_s_enabled',     S_PRI:   'custrecord_sf_s_priority',
    S_JTYPE: 'custrecord_sf_s_join_type',   S_JKEY:  'custrecord_sf_s_join_key',
    S_JONP:  'custrecord_sf_s_join_on_primary',
    S_JMATCH:'custrecord_sf_s_multi_match', S_FJSON: 'custrecord_sf_s_filter_json',
    S_TAGSRC:'custrecord_sf_s_tag_source',  S_TAGCAT:'custrecord_sf_s_tag_category',
    S_RLIM:  'custrecord_sf_s_row_limit',
    // Column
    C_RPT:   'custrecord_sf_c_report',      C_KEY:   'custrecord_sf_c_key',
    C_LBL:   'custrecord_sf_c_label',       C_TYPE:  'custrecord_sf_c_type',
    C_FORM:  'custrecord_sf_c_formula',     C_FMT:   'custrecord_sf_c_format',
    C_DEF:   'custrecord_sf_c_default',     C_REQ:   'custrecord_sf_c_required',
    C_VIS:   'custrecord_sf_c_visible',     C_SORT:  'custrecord_sf_c_sortable',
    C_ORD:   'custrecord_sf_c_order',       C_SUM:   'custrecord_sf_c_summary',
    // Mapping
    M_RPT:   'custrecord_sf_m_report',      M_SRC:   'custrecord_sf_m_source',
    M_KEY:   'custrecord_sf_m_output_key',  M_FIELD: 'custrecord_sf_m_source_field',
    M_XFRM:  'custrecord_sf_m_transform',
    // Flag
    FL_RPT:  'custrecord_sf_fl_report',     FL_NAME: 'custrecord_sf_fl_name',
    FL_COND: 'custrecord_sf_fl_condition',  FL_SEV:  'custrecord_sf_fl_severity',
    FL_CLR:  'custrecord_sf_fl_color',      FL_RSN:  'custrecord_sf_fl_reason',
    FL_ORD:  'custrecord_sf_fl_order',      FL_STOP: 'custrecord_sf_fl_stop',
    // Pivot
    PV_RPT:  'custrecord_sf_pv_report',     PV_LBL:  'custrecord_sf_pv_label',
    PV_GRP:  'custrecord_sf_pv_group_key',  PV_AGG:  'custrecord_sf_pv_agg_key',
    PV_FUNC: 'custrecord_sf_pv_agg_func',   PV_SORT: 'custrecord_sf_pv_sort',
    PV_LIM:  'custrecord_sf_pv_limit',      PV_ORD:  'custrecord_sf_pv_order',
    // Dedupe Rule
    DD_RPT:  'custrecord_sf_dd_report',     DD_FLDS: 'custrecord_sf_dd_fields',
    DD_STG:  'custrecord_sf_dd_strategy',   DD_CMP:  'custrecord_sf_dd_compare_field',
    DD_EN:   'custrecord_sf_dd_enabled',
    // Schedule
    SC_RPT:  'custrecord_sf_sc_report',     SC_ACT:  'custrecord_sf_sc_active',
    SC_FREQ: 'custrecord_sf_sc_frequency',  SC_DOW:  'custrecord_sf_sc_day_of_week',
    SC_DOM:  'custrecord_sf_sc_day_of_month',SC_HOUR:'custrecord_sf_sc_hour',
    SC_NRUN: 'custrecord_sf_sc_next_run',   SC_LRUN: 'custrecord_sf_sc_last_run',
    SC_RECP: 'custrecord_sf_sc_recipients', SC_FOLD: 'custrecord_sf_sc_folder_id',
    SC_FMTS: 'custrecord_sf_sc_formats',    SC_RF:   'custrecord_sf_sc_runtime_filters',
    SC_SUBJ: 'custrecord_sf_sc_email_subject',SC_BODY:'custrecord_sf_sc_email_body',
    SC_CINT:'custrecord_sf_sc_custom_interval', SC_CIUN:'custrecord_sf_sc_custom_unit',
    // Run
    RUN_RPT: 'custrecord_sf_run_report',    RUN_STS: 'custrecord_sf_run_status',
    RUN_TRG: 'custrecord_sf_run_trigger',   RUN_STA: 'custrecord_sf_run_started',
    RUN_END: 'custrecord_sf_run_ended',     RUN_ROW: 'custrecord_sf_run_rows',
    RUN_FLG: 'custrecord_sf_run_flagged',   RUN_SRCS:'custrecord_sf_run_sources_ran',
    RUN_CSV: 'custrecord_sf_run_file_csv',  RUN_XLSX:'custrecord_sf_run_file_xlsx',
    RUN_PDF: 'custrecord_sf_run_file_pdf',  RUN_ERR: 'custrecord_sf_run_error',
    RUN_AI:  'custrecord_sf_run_ai_summary',RUN_FMT: 'custrecord_sf_run_export_fmts',
    RUN_REC: 'custrecord_sf_run_recipients',RUN_MR:  'custrecord_sf_run_mr_task',
    RUN_RF:  'custrecord_sf_run_runtime_filters'
  };

  /* ══ Utils ══════════════════════════════════════════════════════════════════ */
  function ss(v)   { return (v===null||v===undefined)?'':String(v); }
  function toNum(v){ var n=parseFloat(ss(v).replace(/,/g,'')); return isFinite(n)?n:0; }
  function keyify(s){ return ss(s).toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,''); }

  function jsonResp(res,code,obj){
    res.setHeader({name:'Content-Type',value:'application/json; charset=utf-8'});
    res.statusCode=code; res.write(JSON.stringify(obj));
  }
  function parseBody(req){ if(!req.body)return{}; try{return JSON.parse(req.body);}catch(e){return{};} }
  function apiErr(res,e){ log.error({title:'SF',details:e}); jsonResp(res,500,{ok:false,error:e&&e.message?e.message:String(e)}); }

  /* ══ Report Loader ══════════════════════════════════════════════════════════ */
  function loadReport(reportId) {
    var rep = record.load({type:RECORDS.REPORT,id:reportId});
    var rpt = {
      id:String(reportId), name:rep.getValue('name'),
      defaultOutput:rep.getValue(F.R_OUT)||'CSV',
      previewCap:parseInt(rep.getValue(F.R_CAP)||'1000',10),
      sortKeys:rep.getValue(F.R_SORT)||'',
      dedupeKey:rep.getValue(F.R_DEDUP)||'',
      aiEnabled:rep.getValue(F.R_AI)===true||rep.getValue(F.R_AI)==='T',
      mergeMode:rep.getValue(F.R_MERGE)||'APPEND',
      mergeKey:rep.getValue(F.R_MKEY)||'',
      joinSeparator:rep.getValue(F.R_JSEP)||'; ',
      sources:[], columns:[], mappings:[], flags:[], pivots:[]
    };

    try {
      search.create({type:RECORDS.SOURCE,
        filters:[[F.S_RPT,'anyof',reportId]],
        columns:['internalid',F.S_RPT,F.S_SSID,F.S_NAME,F.S_EN,F.S_CAT,F.S_PRI,
                 F.S_JTYPE,F.S_JKEY,F.S_JONP,F.S_JMATCH,F.S_FJSON,F.S_RLIM]
      }).run().each(function(r){
        rpt.sources.push({
          id:r.getValue('internalid'), savedSearchId:r.getValue(F.S_SSID),
          name:r.getValue(F.S_NAME)||r.getValue(F.S_SSID),
          enabled:r.getValue(F.S_EN)===true||r.getValue(F.S_EN)==='T',
          category:r.getValue(F.S_CAT)||'',
          joinType:r.getValue(F.S_JTYPE)||'APPEND',
          joinKey:r.getValue(F.S_JKEY)||'',
          joinOnPrimary:r.getValue(F.S_JONP)||'',
          joinPriority:parseInt(r.getValue(F.S_PRI)||'99',10),
          multiMatch:r.getValue(F.S_JMATCH)||'FIRST',
          filterJson:r.getValue(F.S_FJSON)||'',
          rowLimit:parseInt(r.getValue(F.S_RLIM)||'0',10)||0
        });
        return true;
      });
      rpt.sources.sort(function(a,b){ return a.joinPriority-b.joinPriority; });
    } catch(e) {
      throw new Error('[SF Source / '+RECORDS.SOURCE+'] filter='+F.S_RPT
        +' cols='+[F.S_SSID,F.S_NAME,F.S_EN,F.S_CAT,F.S_PRI,F.S_JTYPE,F.S_JKEY,F.S_JONP,F.S_JMATCH,F.S_FJSON,F.S_RLIM].join(',')
        +' | '+e.message);
    }

    try {
      search.create({type:RECORDS.COLUMN,
        filters:[[F.C_RPT,'anyof',reportId]],
        columns:['internalid',F.C_KEY,F.C_LBL,F.C_TYPE,F.C_REQ,F.C_DEF,F.C_FORM,
                 F.C_FMT,F.C_VIS,F.C_SORT,F.C_ORD,F.C_SUM]
      }).run().each(function(r){
        rpt.columns.push({
          id:r.getValue('internalid'), key:r.getValue(F.C_KEY),
          label:r.getValue(F.C_LBL)||r.getValue(F.C_KEY), type:r.getValue(F.C_TYPE)||'TEXT',
          required:r.getValue(F.C_REQ)===true||r.getValue(F.C_REQ)==='T',
          defaultValue:r.getValue(F.C_DEF)||'', formula:r.getValue(F.C_FORM)||'',
          format:r.getValue(F.C_FMT)||'',
          visible:r.getValue(F.C_VIS)!==false&&r.getValue(F.C_VIS)!=='F',
          sortable:r.getValue(F.C_SORT)===true||r.getValue(F.C_SORT)==='T',
          order:parseInt(r.getValue(F.C_ORD)||'0',10),
          summary:r.getValue(F.C_SUM)||'NONE'
        });
        return true;
      });
      rpt.columns.sort(function(a,b){ return a.order-b.order; });
    } catch(e) {
      throw new Error('[SF Column / '+RECORDS.COLUMN+'] filter='+F.C_RPT
        +' cols='+[F.C_KEY,F.C_LBL,F.C_TYPE,F.C_REQ,F.C_DEF,F.C_FORM,F.C_FMT,F.C_VIS,F.C_SORT,F.C_ORD,F.C_SUM].join(',')
        +' | '+e.message);
    }

    try {
      search.create({type:RECORDS.MAPPING,
        filters:[[F.M_RPT,'anyof',reportId]],
        columns:['internalid',F.M_SRC,F.M_KEY,F.M_FIELD,F.M_XFRM]
      }).run().each(function(r){
        rpt.mappings.push({
          id:r.getValue('internalid'), sourceId:r.getValue(F.M_SRC),
          outputKey:r.getValue(F.M_KEY), sourceField:r.getValue(F.M_FIELD)||'',
          transform:r.getValue(F.M_XFRM)||'NONE'
        });
        return true;
      });
    } catch(e) {
      throw new Error('[SF Mapping / '+RECORDS.MAPPING+'] filter='+F.M_RPT
        +' cols='+[F.M_SRC,F.M_KEY,F.M_FIELD,F.M_XFRM].join(',')
        +' | '+e.message);
    }

    try {
      search.create({type:RECORDS.FLAG,
        filters:[[F.FL_RPT,'anyof',reportId]],
        columns:['internalid',F.FL_NAME,F.FL_COND,F.FL_SEV,F.FL_CLR,
                 F.FL_RSN,F.FL_ORD,F.FL_STOP]
      }).run().each(function(r){
        rpt.flags.push({
          id:r.getValue('internalid'), name:r.getValue(F.FL_NAME),
          condition:r.getValue(F.FL_COND), severity:r.getValue(F.FL_SEV)||'WARNING',
          color:r.getValue(F.FL_CLR)||'', reason:r.getValue(F.FL_RSN)||'',
          order:parseInt(r.getValue(F.FL_ORD)||'0',10),
          stopOnMatch:r.getValue(F.FL_STOP)===true||r.getValue(F.FL_STOP)==='T'
        });
        return true;
      });
      rpt.flags.sort(function(a,b){ return a.order-b.order; });
    } catch(e){
      log.debug({title:'SF Flag search failed',
        details:'['+RECORDS.FLAG+'] filter='+F.FL_RPT+' cols='+[F.FL_NAME,F.FL_COND,F.FL_SEV,F.FL_CLR,F.FL_RSN,F.FL_ORD,F.FL_STOP].join(',')+' | '+e.message});
    }

    try {
      search.create({type:RECORDS.PIVOT,
        filters:[[F.PV_RPT,'anyof',reportId]],
        columns:['internalid',F.PV_LBL,F.PV_GRP,F.PV_AGG,F.PV_FUNC,
                 F.PV_SORT,F.PV_LIM,F.PV_ORD]
      }).run().each(function(r){
        rpt.pivots.push({
          id:r.getValue('internalid'), label:r.getValue(F.PV_LBL)||'',
          groupKey:r.getValue(F.PV_GRP), aggKey:r.getValue(F.PV_AGG),
          aggFunc:r.getValue(F.PV_FUNC)||'SUM',
          sort:r.getValue(F.PV_SORT)||'VALUE_DESC',
          limit:parseInt(r.getValue(F.PV_LIM)||'0',10)||0,
          order:parseInt(r.getValue(F.PV_ORD)||'0',10)
        });
        return true;
      });
      rpt.pivots.sort(function(a,b){ return a.order-b.order; });
    } catch(e){
      log.debug({title:'SF Pivot search failed',
        details:'['+RECORDS.PIVOT+'] filter='+F.PV_RPT+' cols='+[F.PV_LBL,F.PV_GRP,F.PV_AGG,F.PV_FUNC,F.PV_SORT,F.PV_LIM,F.PV_ORD].join(',')+' | '+e.message});
    }

    return rpt;
  }

  /* ══ Mapping Index ══════════════════════════════════════════════════════════ */
  function buildMappingIndex(rpt) {
    var idx={};
    rpt.sources.forEach(function(s){ idx[s.id]={}; });
    rpt.mappings.forEach(function(m){
      if(!idx[m.sourceId])idx[m.sourceId]={};
      idx[m.sourceId][m.outputKey]={sourceField:m.sourceField,transform:m.transform||'NONE'};
    });
    return idx;
  }

  /* ══ Single-row field extraction ══════════════════════════════════════════ */
  function applyMappingTransform(v, transform) {
    switch((transform||'NONE').toUpperCase()) {
      case 'UPPER':  return ss(v).toUpperCase();
      case 'LOWER':  return ss(v).toLowerCase();
      case 'TRIM':   return ss(v).trim();
      case 'NUMBER': return toNum(v);
      default:       return v;
    }
  }

  function extractRow(rpt, src, idx, res) {
    var byLabel={}, byNorm={};
    (res.columns||[]).forEach(function(c){
      var lk=keyify(c.label||c.name||''), nk=keyify(c.name);
      byLabel[lk]=c; byLabel[nk]=c;
      // normalized: strip underscores so "customer_name" == "customername" == "Customer Name"
      var nl=lk.replace(/_/g,''), nn=nk.replace(/_/g,'');
      if(!byNorm[nl]) byNorm[nl]=c;
      if(!byNorm[nn]) byNorm[nn]=c;
    });
    var row={__sourceName:src.name,__sourceId:src.id};
    rpt.columns.forEach(function(col){
      if(col.type==='COMPUTED'){ row[col.key]=''; return; } // computed later
      var m=(idx[src.id]&&idx[src.id][col.key])||null;
      var v='', hit;
      if(m&&m.sourceField){
        hit=byLabel[keyify(m.sourceField)];
        if(!hit) hit=byNorm[keyify(m.sourceField).replace(/_/g,'')];
        if(hit) v=res.getText(hit)!=null?res.getText(hit):(res.getValue(hit)||'');
        v=applyMappingTransform(v,m.transform);
      } else {
        hit=byLabel[keyify(col.label)];
        if(!hit) hit=byLabel[keyify(col.key)];
        if(!hit) hit=byNorm[keyify(col.label).replace(/_/g,'')];
        if(!hit) hit=byNorm[keyify(col.key).replace(/_/g,'')];
        if(hit) v=res.getText(hit)!=null?res.getText(hit):(res.getValue(hit)||'');
      }
      if(!v&&col.defaultValue) v=col.defaultValue;
      row[col.key]=v;
    });
    return row;
  }

  /* ══ Pull all rows from one source ════════════════════════════════════════ */
  function pullSource(src, rf, cap) {
    var s=search.load({id:src.savedSearchId});
    // Apply runtime filters
    if(rf&&rf.length){ var ex=s.filters||[]; s.filters=ex.length?[ex,'AND',rf]:rf; }
    // Apply source-level filter JSON
    if(src.filterJson){
      try {
        var fj=JSON.parse(src.filterJson);
        if(Array.isArray(fj)&&fj.length){
          var cur=s.filters||[]; s.filters=cur.length?[cur,'AND',fj]:fj;
        }
      } catch(e){}
    }
    // Source row limit overrides cap if set
    var effectiveCap=(src.rowLimit>0)?Math.min(src.rowLimit,cap):cap;
    var rows=[], paged=s.runPaged({pageSize:1000});
    for(var i=0;i<paged.pageRanges.length;i++){
      if(rows.length>=effectiveCap) break;
      var page=paged.fetch({index:i});
      for(var j=0;j<page.data.length;j++){
        rows.push({_nsrow:page.data[j], _srcId:src.id});
        if(rows.length>=effectiveCap) break;
      }
    }
    return rows;
  }

  /* ══ APPEND engine (stack all sources vertically) ═════════════════════════ */
  function runAppend(rpt, idx, rf, cap) {
    var rows=[];
    rpt.sources.filter(function(s){return s.enabled;}).forEach(function(src){
      if(rows.length>=cap) return;
      var raw=pullSource(src,rf,cap-rows.length);
      raw.forEach(function(r){ rows.push(extractRow(rpt,src,idx,r._nsrow)); });
    });
    return rows;
  }

  /* ══ JOIN engine (horizontal merge on key) ════════════════════════════════ */
  function runJoin(rpt, idx, rf, cap, sep) {
    var enabled=rpt.sources.filter(function(s){return s.enabled;});
    var primary=null;
    enabled.forEach(function(s){ if(s.joinType==='PRIMARY'&&!primary) primary=s; });
    // fallback: first source is primary
    if(!primary) primary=enabled[0]||null;
    if(!primary) return [];
    var primaryId=primary.id;

    // Pull primary
    var primRaw=pullSource(primary,rf,cap);
    var primRows=primRaw.map(function(r){ return extractRow(rpt,primary,idx,r._nsrow); });

    // Build primary index by joinKey value
    var primIdx={};
    var jk=primary.joinKey || rpt.columns[0] && rpt.columns[0].key || '';
    primRows.forEach(function(row,i){
      var kv=ss(row[jk]).trim();
      if(!primIdx[kv]) primIdx[kv]=[];
      primIdx[kv].push(i);
    });

    // Enrich with each non-primary source
    var enrichSources=enabled.filter(function(s){ return s.id!==primaryId && s.joinType!=='APPEND'; });
    enrichSources.sort(function(a,b){return a.joinPriority-b.joinPriority;});

    enrichSources.forEach(function(src){
      var raw=pullSource(src,rf,cap);
      // group enrichment rows by their join key
      var enrichIdx={};
      raw.forEach(function(r){
        var row=extractRow(rpt,src,idx,r._nsrow);
        var onKey=src.joinOnPrimary||jk; // what key in primary to match
        var kv=ss(row[src.joinKey||onKey]).trim();
        if(!enrichIdx[kv]) enrichIdx[kv]=[];
        enrichIdx[kv].push(row);
      });

      // Determine which output columns belong to this source (have mappings)
      var srcColKeys=[];
      rpt.columns.forEach(function(col){
        if(idx[src.id]&&idx[src.id][col.key]) srcColKeys.push(col.key);
      });

      // Apply to primary rows
      var newPrimRows=[];
      primRows.forEach(function(prow){
        var onKey=src.joinOnPrimary||jk;
        var kv=ss(prow[onKey]).trim();
        var matches=enrichIdx[kv]||[];

        if(!matches.length){
          if(src.joinType==='INNER') return; // skip row entirely
          // LEFT JOIN — keep primary row, fill enrichment cols blank
          newPrimRows.push(prow);
          return;
        }

        if(src.multiMatch==='FIRST'||matches.length===1){
          var m=matches[0];
          srcColKeys.forEach(function(k){ if(m[k]!==undefined) prow[k]=m[k]; });
          newPrimRows.push(prow);
        } else if(src.multiMatch==='LAST'){
          var m2=matches[matches.length-1];
          srcColKeys.forEach(function(k){ if(m2[k]!==undefined) prow[k]=m2[k]; });
          newPrimRows.push(prow);
        } else if(src.multiMatch==='CONCAT'){
          srcColKeys.forEach(function(k){
            prow[k]=matches.map(function(m){ return ss(m[k]); }).filter(Boolean).join(sep||'; ');
          });
          newPrimRows.push(prow);
        } else if(src.multiMatch==='SUM'){
          srcColKeys.forEach(function(k){
            prow[k]=matches.reduce(function(s,m){ return s+toNum(m[k]); },0);
          });
          newPrimRows.push(prow);
        } else {
          // EXPAND — one output row per match
          matches.forEach(function(m){
            var clone=JSON.parse(JSON.stringify(prow));
            srcColKeys.forEach(function(k){ if(m[k]!==undefined) clone[k]=m[k]; });
            newPrimRows.push(clone);
          });
        }
      });
      primRows=newPrimRows;
    });

    // Append-mode sources (stack after joined rows)
    var appendSources=enabled.filter(function(s){ return s.joinType==='APPEND'&&s.id!==primaryId; });
    appendSources.forEach(function(src){
      var raw=pullSource(src,rf,cap-primRows.length);
      raw.forEach(function(r){ primRows.push(extractRow(rpt,src,idx,r._nsrow)); });
    });

    return primRows;
  }

  /* ══ SMART merge (auto-join on a common key across all sources) ═══════════ */
  // For each unique value of mKey, the source that contributes the MOST rows for
  // that key becomes the "anchor".  Every other source enriches the anchor rows
  // via a LEFT JOIN (blank if no match).  Handles the classic scenario:
  //   Search A: customer_id, balance          (1 row per customer)
  //   Search B: sales_order_id, customer_id, amount  (N rows per customer)
  //   Result:   N rows, each row = sales order fields + balance from Search A
  function runSmartMerge(rpt, idx, rf, cap) {
    var enabled = rpt.sources.filter(function(s){ return s.enabled; });
    if(!enabled.length) return [];

    var mKey = ss(rpt.mergeKey).trim();
    if(!mKey) return runAppend(rpt,idx,rf,cap); // no key configured → plain union

    // Pull & index every source by the merge-key value
    var sourceData = [];
    enabled.forEach(function(src){
      var rowsByKey = {};
      pullSource(src,rf,cap).forEach(function(r){
        var row = extractRow(rpt,src,idx,r._nsrow);
        var kv  = ss(row[mKey]).trim();
        if(!rowsByKey[kv]) rowsByKey[kv] = [];
        rowsByKey[kv].push(row);
      });
      sourceData.push({src:src, rowsByKey:rowsByKey});
    });

    // Collect all unique key values in encounter order
    var keyOrder = [], keySet = {};
    sourceData.forEach(function(sd){
      Object.keys(sd.rowsByKey).forEach(function(kv){
        if(!keySet[kv]){ keySet[kv]=true; keyOrder.push(kv); }
      });
    });

    var result = [];
    keyOrder.forEach(function(kv){
      // Pick the anchor source: the one with the most rows for this key
      var anchor = null, maxRows = 0;
      sourceData.forEach(function(sd){
        var n = (sd.rowsByKey[kv]||[]).length;
        if(n > maxRows){ maxRows = n; anchor = sd; }
      });
      if(!anchor || maxRows === 0) return;

      // One output row per anchor row; enrich each with data from other sources
      anchor.rowsByKey[kv].forEach(function(aRow){
        var out = JSON.parse(JSON.stringify(aRow));
        out.__sourceName = anchor.src.name;
        sourceData.forEach(function(sd){
          if(sd === anchor) return;
          var matches = sd.rowsByKey[kv] || [];
          if(!matches.length) return; // LEFT JOIN: just leave columns blank
          // Fill any output column that is still blank from the first match
          rpt.columns.forEach(function(col){
            if(col.type==='COMPUTED') return;
            if(ss(out[col.key])) return; // already populated
            var v = ss(matches[0][col.key]);
            if(v) out[col.key] = v;
          });
          if(out.__sourceName.indexOf(sd.src.name) < 0)
            out.__sourceName += ', ' + sd.src.name;
        });
        result.push(out);
      });
    });
    return result;
  }

  /* ══ Computed columns ══════════════════════════════════════════════════════ */
  function evalFormula(formula, row) {
    if(!formula) return '';
    try {
      // Replace {key} tokens with row values
      var expr=formula.replace(/\{(\w+)\}/g,function(_,k){
        var v=row[k]; return (v===undefined||v==='')?'""':JSON.stringify(ss(v));
      });
      // Basic IF(cond, then, else) → ternary
      expr=expr.replace(/\bIF\s*\(([^,]+),([^,]+),([^)]+)\)/gi,'(($1)?($2):($3))');
      // CONCAT(a,b,...) → string concat
      expr=expr.replace(/\bCONCAT\s*\(([^)]+)\)/gi,function(_,args){
        return '(['+args+'].map(String).join(""))';
      });
      // COALESCE(a,b,...) → first non-empty
      expr=expr.replace(/\bCOALESCE\s*\(([^)]+)\)/gi,function(_,args){
        return '(['+args+'].find(function(v){return v!==null&&v!==undefined&&v!==""})||"")';
      });
      // ROUND(v,d)
      expr=expr.replace(/\bROUND\s*\(([^,)]+),([^)]+)\)/gi,'(Math.round(($1)*Math.pow(10,($2)))/Math.pow(10,($2)))');
      expr=expr.replace(/\bABS\s*\(/gi,'Math.abs(');
      expr=expr.replace(/\bMAX\s*\(/gi,'Math.max(');
      expr=expr.replace(/\bMIN\s*\(/gi,'Math.min(');
      expr=expr.replace(/\bTRIM\s*\(([^)]+)\)/gi,'(String($1).trim())');
      expr=expr.replace(/\bUPPER\s*\(([^)]+)\)/gi,'(String($1).toUpperCase())');
      expr=expr.replace(/\bLOWER\s*\(([^)]+)\)/gi,'(String($1).toLowerCase())');
      expr=expr.replace(/\bLEN\s*\(([^)]+)\)/gi,'(String($1).length)');
      expr=expr.replace(/\bLEFT\s*\(([^,)]+),([^)]+)\)/gi,'(String($1).slice(0,$2))');
      expr=expr.replace(/\bRIGHT\s*\(([^,)]+),([^)]+)\)/gi,'(String($1).slice(-($2)))');
      // eslint-disable-next-line no-new-func
      var result=new Function('return ('+expr+')')();
      return (result===null||result===undefined)?'':result;
    } catch(e){ return '#ERR:'+e.message; }
  }

  function applyComputedCols(rpt, rows) {
    var computed=rpt.columns.filter(function(c){return c.type==='COMPUTED'&&c.formula;});
    if(!computed.length) return rows;
    rows.forEach(function(row){
      computed.forEach(function(col){ row[col.key]=evalFormula(col.formula,row); });
    });
    return rows;
  }

  /* ══ Flag rules ════════════════════════════════════════════════════════════ */
  function applyFlags(rpt, rows) {
    if(!rpt.flags||!rpt.flags.length) return rows;
    rows.forEach(function(row){
      row.__flags=[];
      rpt.flags.forEach(function(fl){
        try {
          var expr=fl.condition.replace(/\{(\w+)\}/g,function(_,k){
            var v=row[k]; return (v===undefined||v==='')?'""':JSON.stringify(ss(v));
          });
          expr=expr.replace(/\bAND\b/gi,'&&').replace(/\bOR\b/gi,'||').replace(/\bNOT\b/gi,'!');
          // eslint-disable-next-line no-new-func
          if(new Function('return !!('+expr+')')()) row.__flags.push(fl.name);
        } catch(e){}
      });
    });
    return rows;
  }

  /* ══ Sort / dedupe ══════════════════════════════════════════════════════════ */
  function dedupeRows(rows,key){
    if(!key) return rows;
    var keys=key.split('|').map(function(s){return s.trim();}).filter(Boolean);
    if(!keys.length) return rows;
    var seen={};
    return rows.filter(function(r){
      var k=keys.map(function(x){return ss(r[x]);}).join('|');
      if(seen[k]) return false; seen[k]=true; return true;
    });
  }

  function sortRows(rows,sortKeys){
    if(!sortKeys) return rows;
    var keys=sortKeys.split(',').map(function(s){return s.trim();}).filter(Boolean);
    if(!keys.length) return rows;
    return rows.slice().sort(function(a,b){
      for(var i=0;i<keys.length;i++){
        var c=ss(a[keys[i]]).localeCompare(ss(b[keys[i]])); if(c!==0) return c;
      }
      return 0;
    });
  }

  /* ══ Aggregations ═══════════════════════════════════════════════════════════ */
  function computeTotals(rpt,rows){
    var t={};
    rpt.columns.forEach(function(c){
      if(c.type==='NUMBER'||c.type==='CURRENCY')
        t[c.key]=rows.reduce(function(s,r){return s+toNum(r[c.key]);},0);
    });
    return t;
  }

  function computeAnomalies(rpt,rows){
    var out=[],miss=0;
    rows.forEach(function(r){ rpt.columns.forEach(function(c){ if(c.required&&!ss(r[c.key]).trim()) miss++; }); });
    if(miss) out.push({type:'missing_required',count:miss});
    var neg={};
    rpt.columns.forEach(function(c){
      if(c.type==='NUMBER'||c.type==='CURRENCY'){
        var n=rows.filter(function(r){return toNum(r[c.key])<0;}).length;
        if(n) neg[c.key]=n;
      }
    });
    if(Object.keys(neg).length) out.push({type:'negative_values',fields:neg});
    return out;
  }

  function computePivots(rpt,rows){
    if(!rpt.pivots||!rpt.pivots.length) return [];
    return rpt.pivots.map(function(pv){
      var groups={};
      rows.forEach(function(row){
        var gv=ss(row[pv.groupKey])||'(blank)';
        if(!groups[gv]) groups[gv]=[];
        groups[gv].push(row);
      });
      var result=Object.keys(groups).sort().map(function(gv){
        var grpRows=groups[gv], agg;
        if(pv.aggFunc==='COUNT')      agg=grpRows.length;
        else if(pv.aggFunc==='SUM')   agg=grpRows.reduce(function(s,r){return s+toNum(r[pv.aggKey]);},0);
        else if(pv.aggFunc==='AVG')   agg=grpRows.reduce(function(s,r){return s+toNum(r[pv.aggKey]);},0)/grpRows.length;
        else if(pv.aggFunc==='MAX')   agg=Math.max.apply(null,grpRows.map(function(r){return toNum(r[pv.aggKey]);}));
        else if(pv.aggFunc==='MIN')   agg=Math.min.apply(null,grpRows.map(function(r){return toNum(r[pv.aggKey]);}));
        else agg=grpRows.length;
        return {group:gv, value:agg, count:grpRows.length};
      });
      return {label:pv.label||pv.groupKey, groupKey:pv.groupKey, aggKey:pv.aggKey, aggFunc:pv.aggFunc, rows:result};
    });
  }

  /* ══ Full pipeline ══════════════════════════════════════════════════════════ */
  function runPipeline(reportId, rfJson, offset, limit) {
    var rpt=loadReport(reportId), idx=buildMappingIndex(rpt);
    var rf=null;
    if(rfJson){try{var p=JSON.parse(rfJson);if(Array.isArray(p))rf=p;}catch(e){}}
    var cap=rpt.previewCap||1000;

    // STAGE 1+2: Extract + Merge
    var rows = rpt.mergeMode==='JOIN'
      ? runJoin(rpt,idx,rf,cap,rpt.joinSeparator)
      : rpt.mergeMode==='SMART'
        ? runSmartMerge(rpt,idx,rf,cap)
        : runAppend(rpt,idx,rf,cap);

    // STAGE 3: Transform
    rows=applyComputedCols(rpt,rows);
    rows=applyFlags(rpt,rows);
    rows=dedupeRows(rows,rpt.dedupeKey);
    rows=sortRows(rows,rpt.sortKeys);

    var o=Math.max(0,parseInt(offset||'0',10));
    var l=Math.max(1,Math.min(parseInt(limit||'50',10),500));
    var flaggedRows=rows.filter(function(r){return r.__flags&&r.__flags.length;});

    return {
      report:rpt, rows:rows.slice(o,o+l),
      rowCount:rows.length, flaggedCount:flaggedRows.length,
      offset:o, limit:l,
      totals:computeTotals(rpt,rows),
      anomalies:computeAnomalies(rpt,rows),
      pivots:computePivots(rpt,rows),
      flagSummary:rpt.flags.map(function(fl){
        return {name:fl.name,severity:fl.severity,color:fl.color,
          count:rows.filter(function(r){return r.__flags&&r.__flags.indexOf(fl.name)>=0;}).length};
      })
    };
  }

  function createRun(opts){
    var r=record.create({type:RECORDS.RUN});
    r.setValue({fieldId:F.RUN_RPT, value:opts.reportId});
    r.setValue({fieldId:F.RUN_STS, value:'QUEUED'});
    r.setValue({fieldId:F.RUN_TRG, value:opts.trigger||'MANUAL'});
    r.setValue({fieldId:F.RUN_FMT, value:opts.format||'CSV'});
    r.setValue({fieldId:F.RUN_RF,  value:opts.runtimeFilters||''});
    if(opts.recipients) r.setValue({fieldId:F.RUN_REC,value:opts.recipients});
    return r.save();
  }
  function updateRun(runId,values){
    record.submitFields({type:RECORDS.RUN,id:runId,values:values,
      options:{enableSourcing:false,ignoreMandatoryFields:true}});
  }


  /* ══ API Handler ════════════════════════════════════════════════════════════ */
  function handleApi(req,res) {
    var action=(req.parameters.action||'');
    var method=(req.method||'GET').toUpperCase();
    var body=method==='POST'?parseBody(req):{};

    try {

      /* searches.list */
      if(action==='searches.list'){
        var rows=[];
        search.create({type:'savedsearch',columns:[
          search.createColumn({name:'internalid'}),
          search.createColumn({name:'title',sort:search.Sort.ASC}),
          search.createColumn({name:'recordtype'})
        ]}).run().each(function(r){
          rows.push({id:r.getValue('internalid'),name:r.getValue('title')||r.getValue('internalid'),recordType:r.getValue('recordtype')||''});
          return rows.length<500;
        });
        return jsonResp(res,200,{ok:true,data:rows});
      }

      /* reports */
      if(action==='reports.list'){
        var rrows=[];
        search.create({type:RECORDS.REPORT,filters:[],columns:['internalid','name']})
          .run().each(function(r){rrows.push({id:r.getValue('internalid'),name:r.getValue('name')});return true;});
        return jsonResp(res,200,{ok:true,data:rrows});
      }

      if(action==='reports.get') return jsonResp(res,200,{ok:true,data:loadReport(req.parameters.reportId)});

      if(action==='reports.create'&&method==='POST'){
        var nr=record.create({type:RECORDS.REPORT});
        nr.setValue({fieldId:'name',value:body.name||'New Report'});
        nr.setValue({fieldId:F.R_MERGE,value:'APPEND'});
        return jsonResp(res,200,{ok:true,data:{id:nr.save()}});
      }

      if(action==='reports.update'&&method==='POST'){
        if(!body.id) return jsonResp(res,400,{ok:false,error:'Missing id'});
        var v={name:body.name};
        v[F.R_OUT]=body.defaultOutput||'CSV'; v[F.R_CAP]=body.previewCap||1000;
        v[F.R_SORT]=body.sortKeys||'';       v[F.R_DEDUP]=body.dedupeKey||'';
        v[F.R_AI]=!!body.aiEnabled;
        v[F.R_MERGE]=body.mergeMode||'APPEND';
        v[F.R_MKEY]=body.mergeKey||'';
        v[F.R_JSEP]=body.joinSeparator||'; ';
        record.submitFields({type:RECORDS.REPORT,id:body.id,values:v,options:{ignoreMandatoryFields:true}});
        return jsonResp(res,200,{ok:true,data:{id:body.id}});
      }

      if(action==='reports.delete'&&method==='POST'){
        record.delete({type:RECORDS.REPORT,id:body.id});
        return jsonResp(res,200,{ok:true,data:true});
      }

      if(action==='reports.duplicate'&&method==='POST'){
        if(!body.id) return jsonResp(res,400,{ok:false,error:'Missing id'});
        var src2=record.load({type:RECORDS.REPORT,id:body.id});
        var nr2=record.create({type:RECORDS.REPORT});
        nr2.setValue({fieldId:'name',         value:'Copy of '+src2.getValue('name')});
        nr2.setValue({fieldId:F.R_OUT,        value:src2.getValue(F.R_OUT)||'CSV'});
        nr2.setValue({fieldId:F.R_CAP,        value:src2.getValue(F.R_CAP)||1000});
        nr2.setValue({fieldId:F.R_SORT,       value:src2.getValue(F.R_SORT)||''});
        nr2.setValue({fieldId:F.R_DEDUP,      value:src2.getValue(F.R_DEDUP)||''});
        nr2.setValue({fieldId:F.R_AI,         value:src2.getValue(F.R_AI)===true||src2.getValue(F.R_AI)==='T'});
        nr2.setValue({fieldId:F.R_MERGE,      value:src2.getValue(F.R_MERGE)||'APPEND'});
        nr2.setValue({fieldId:F.R_MKEY,       value:src2.getValue(F.R_MKEY)||''});
        nr2.setValue({fieldId:F.R_JSEP,       value:src2.getValue(F.R_JSEP)||'; '});
        return jsonResp(res,200,{ok:true,data:{id:nr2.save()}});
      }

      /* sources */
      if(action==='sources.create'&&method==='POST'){
        var sr=record.create({type:RECORDS.SOURCE});
        sr.setValue({fieldId:F.S_RPT,    value:body.reportId});
        sr.setValue({fieldId:F.S_SSID,   value:body.savedSearchId});
        sr.setValue({fieldId:F.S_NAME,   value:body.name||body.savedSearchId});
        sr.setValue({fieldId:F.S_EN,     value:!!body.enabled});
        sr.setValue({fieldId:F.S_CAT,    value:body.category||''});
        sr.setValue({fieldId:F.S_PRI,    value:body.priority||99});
        sr.setValue({fieldId:F.S_JTYPE,  value:body.joinType||'APPEND'});
        sr.setValue({fieldId:F.S_JKEY,   value:body.joinKey||''});
        sr.setValue({fieldId:F.S_JONP,   value:body.joinOnPrimary||''});
        sr.setValue({fieldId:F.S_JMATCH, value:body.multiMatch||'FIRST'});
        sr.setValue({fieldId:F.S_FJSON,  value:body.filterJson||''});
        sr.setValue({fieldId:F.S_RLIM,   value:body.rowLimit||0});
        return jsonResp(res,200,{ok:true,data:{id:sr.save()}});
      }

      if(action==='sources.update'&&method==='POST'){
        var sv={};
        sv[F.S_SSID]=body.savedSearchId; sv[F.S_NAME]=body.name;
        sv[F.S_EN]=!!body.enabled;       sv[F.S_CAT]=body.category||'';
        sv[F.S_PRI]=body.priority||99;
        sv[F.S_JTYPE]=body.joinType||'APPEND';
        sv[F.S_JKEY]=body.joinKey||'';   sv[F.S_JONP]=body.joinOnPrimary||'';
        sv[F.S_JMATCH]=body.multiMatch||'FIRST';
        sv[F.S_FJSON]=body.filterJson||''; sv[F.S_RLIM]=body.rowLimit||0;
        record.submitFields({type:RECORDS.SOURCE,id:body.id,values:sv,options:{ignoreMandatoryFields:true}});
        return jsonResp(res,200,{ok:true,data:{id:body.id}});
      }

      if(action==='sources.delete'&&method==='POST'){
        record.delete({type:RECORDS.SOURCE,id:body.id});
        return jsonResp(res,200,{ok:true,data:true});
      }

      if(action==='sources.describe'){
        var ss2=search.load({id:req.parameters.savedSearchId});
        var cols=(ss2.columns||[]).map(function(c){return{name:c.name,label:c.label||c.name,join:c.join||'',summary:c.summary||''};});
        return jsonResp(res,200,{ok:true,data:cols});
      }

      /* Detect columns that appear in 2+ enabled sources for a report */
      if(action==='sources.common-columns'){
        var rpid=req.parameters.reportId;
        var srcList=[];
        search.create({type:RECORDS.SOURCE,
          filters:[[F.S_RPT,'anyof',rpid],[F.S_EN,'is','T']],
          columns:['internalid',F.S_SSID,F.S_NAME]
        }).run().each(function(r){
          srcList.push({id:r.getValue('internalid'),ssid:r.getValue(F.S_SSID),name:r.getValue(F.S_NAME)});
          return true;
        });
        var labelMap={};
        srcList.forEach(function(src){
          try{
            var ss3=search.load({id:src.ssid});
            (ss3.columns||[]).forEach(function(c){
              var norm=ss(c.label||c.name).toLowerCase().trim();
              if(!labelMap[norm]) labelMap[norm]={label:c.label||c.name,name:c.name,count:0,sources:[]};
              labelMap[norm].count++;
              if(labelMap[norm].sources.indexOf(src.name)<0) labelMap[norm].sources.push(src.name);
            });
          }catch(e2){}
        });
        var common=[];
        Object.keys(labelMap).forEach(function(k){
          if(labelMap[k].count>=2) common.push(labelMap[k]);
        });
        common.sort(function(a,b){ return b.count-a.count; });
        return jsonResp(res,200,{ok:true,data:common});
      }

      /* columns */
      if(action==='columns.create'&&method==='POST'){
        var cr=record.create({type:RECORDS.COLUMN});
        cr.setValue({fieldId:F.C_RPT,  value:body.reportId});
        cr.setValue({fieldId:F.C_KEY,  value:body.key});
        cr.setValue({fieldId:F.C_LBL,  value:body.label||body.key});
        cr.setValue({fieldId:F.C_TYPE, value:body.type||'TEXT'});
        cr.setValue({fieldId:F.C_FORM, value:body.formula||''});
        cr.setValue({fieldId:F.C_FMT,  value:body.format||''});
        cr.setValue({fieldId:F.C_DEF,  value:body.defaultValue||''});
        cr.setValue({fieldId:F.C_REQ,  value:!!body.required});
        cr.setValue({fieldId:F.C_VIS,  value:body.visible!==false});
        cr.setValue({fieldId:F.C_SORT, value:!!body.sortable});
        cr.setValue({fieldId:F.C_ORD,  value:body.order||0});
        cr.setValue({fieldId:F.C_SUM,  value:body.summary||'NONE'});
        return jsonResp(res,200,{ok:true,data:{id:cr.save()}});
      }

      if(action==='columns.update'&&method==='POST'){
        var cv={};
        cv[F.C_KEY]=body.key;     cv[F.C_LBL]=body.label;
        cv[F.C_TYPE]=body.type||'TEXT';
        cv[F.C_FORM]=body.formula||''; cv[F.C_FMT]=body.format||'';
        cv[F.C_DEF]=body.defaultValue||'';
        cv[F.C_REQ]=!!body.required;
        cv[F.C_VIS]=body.visible!==false;
        cv[F.C_SORT]=!!body.sortable;
        cv[F.C_ORD]=body.order||0;
        cv[F.C_SUM]=body.summary||'NONE';
        record.submitFields({type:RECORDS.COLUMN,id:body.id,values:cv,options:{ignoreMandatoryFields:true}});
        return jsonResp(res,200,{ok:true,data:{id:body.id}});
      }

      if(action==='columns.delete'&&method==='POST'){
        record.delete({type:RECORDS.COLUMN,id:body.id});
        return jsonResp(res,200,{ok:true,data:true});
      }

      /* mappings */
      if(action==='mappings.upsert'&&method==='POST'){
        var ids=[];
        search.create({type:RECORDS.MAPPING,filters:[[F.M_RPT,'anyof',body.reportId]],columns:['internalid']})
          .run().each(function(r){ids.push(r.getValue('internalid'));return true;});
        ids.forEach(function(id){try{record.delete({type:RECORDS.MAPPING,id:id});}catch(e){}});
        (body.mappings||[]).forEach(function(m){
          var mr=record.create({type:RECORDS.MAPPING});
          mr.setValue({fieldId:F.M_RPT,  value:body.reportId});
          mr.setValue({fieldId:F.M_SRC,  value:m.sourceId});
          mr.setValue({fieldId:F.M_KEY,  value:m.outputKey});
          mr.setValue({fieldId:F.M_FIELD,value:m.sourceField||''});
          mr.setValue({fieldId:F.M_XFRM, value:m.transform||'NONE'});
          mr.save();
        });
        return jsonResp(res,200,{ok:true,data:{count:(body.mappings||[]).length}});
      }

      /* flags */
      if(action==='flags.upsert'&&method==='POST'){
        var fids=[];
        try{
          search.create({type:RECORDS.FLAG,filters:[[F.FL_RPT,'anyof',body.reportId]],columns:['internalid']})
            .run().each(function(r){fids.push(r.getValue('internalid'));return true;});
        }catch(e){}
        fids.forEach(function(id){try{record.delete({type:RECORDS.FLAG,id:id});}catch(e){}});
        (body.flags||[]).forEach(function(fl){
          var fr=record.create({type:RECORDS.FLAG});
          fr.setValue({fieldId:F.FL_RPT,  value:body.reportId});
          fr.setValue({fieldId:F.FL_NAME, value:fl.name||'Flag'});
          fr.setValue({fieldId:F.FL_COND, value:fl.condition||''});
          fr.setValue({fieldId:F.FL_SEV,  value:fl.severity||'WARNING'});
          fr.setValue({fieldId:F.FL_CLR,  value:fl.color||''});
          fr.setValue({fieldId:F.FL_RSN,  value:fl.reason||''});
          fr.setValue({fieldId:F.FL_ORD,  value:fl.order||0});
          fr.setValue({fieldId:F.FL_STOP, value:!!fl.stopOnMatch});
          fr.save();
        });
        return jsonResp(res,200,{ok:true,data:{count:(body.flags||[]).length}});
      }

      /* pivots */
      if(action==='pivots.upsert'&&method==='POST'){
        var pvids=[];
        try{
          search.create({type:RECORDS.PIVOT,filters:[[F.PV_RPT,'anyof',body.reportId]],columns:['internalid']})
            .run().each(function(r){pvids.push(r.getValue('internalid'));return true;});
        }catch(e){}
        pvids.forEach(function(id){try{record.delete({type:RECORDS.PIVOT,id:id});}catch(e){}});
        (body.pivots||[]).forEach(function(pv){
          var pr=record.create({type:RECORDS.PIVOT});
          pr.setValue({fieldId:F.PV_RPT,  value:body.reportId});
          pr.setValue({fieldId:F.PV_LBL,  value:pv.label||''});
          pr.setValue({fieldId:F.PV_GRP,  value:pv.groupKey||''});
          pr.setValue({fieldId:F.PV_AGG,  value:pv.aggKey||''});
          pr.setValue({fieldId:F.PV_FUNC, value:pv.aggFunc||'SUM'});
          pr.setValue({fieldId:F.PV_SORT, value:pv.sort||'VALUE_DESC'});
          pr.setValue({fieldId:F.PV_LIM,  value:pv.limit||0});
          pr.setValue({fieldId:F.PV_ORD,  value:pv.order||0});
          pr.save();
        });
        return jsonResp(res,200,{ok:true,data:{count:(body.pivots||[]).length}});
      }

      /* runs */
      if(action==='runs.preview')
        return jsonResp(res,200,{ok:true,data:runPipeline(
          req.parameters.reportId, req.parameters.runtimeFilters||'',
          req.parameters.offset||'0', req.parameters.limit||'50')});

      if(action==='runs.export'&&method==='POST'){
        var runId=createRun({reportId:body.reportId,trigger:'UI',
          format:(body.format||'CSV').toUpperCase(),
          runtimeFilters:body.runtimeFilters||'',recipients:body.recipients||''});
        var t2=task.create({taskType:task.TaskType.MAP_REDUCE,
          scriptId:'customscript_sf_mr_export',
          params:{custscript_sf_runid:String(runId),custscript_sf_reportid:String(body.reportId),
            custscript_sf_format:(body.format||'CSV').toUpperCase(),
            custscript_sf_runtimefilters:body.runtimeFilters||''}});
        var taskId=t2.submit();
        var u2={}; u2[F.RUN_STS]='RUNNING'; u2[F.RUN_ERR]='';
        updateRun(runId,u2);
        return jsonResp(res,200,{ok:true,data:{runId:runId,taskId:taskId}});
      }

      if(action==='runs.history'){
        var hf=[];
        if(req.parameters.reportId){hf.push([F.RUN_RPT,'anyof',req.parameters.reportId]);}
        if(req.parameters.status){if(hf.length)hf.push('AND');hf.push([F.RUN_STS,'is',req.parameters.status]);}
        var hs=search.create({type:RECORDS.RUN,filters:hf,
          columns:['internalid','created',F.RUN_STS,F.RUN_TRG,F.RUN_ROW,F.RUN_FLG,
                   F.RUN_CSV,F.RUN_XLSX,F.RUN_PDF,F.RUN_ERR,F.RUN_FMT,F.RUN_RPT,
                   F.RUN_STA,F.RUN_END,F.RUN_MR,
                   search.createColumn({name:'created',sort:search.Sort.DESC})]});
        var hrows=[];
        hs.run().each(function(r){
          hrows.push({id:r.getValue('internalid'),created:r.getValue('created'),
            status:r.getValue(F.RUN_STS),trigger:r.getValue(F.RUN_TRG),
            rows:r.getValue(F.RUN_ROW),flagged:r.getValue(F.RUN_FLG),
            format:r.getValue(F.RUN_FMT),
            fileCsv:r.getValue(F.RUN_CSV),fileXlsx:r.getValue(F.RUN_XLSX),
            filePdf:r.getValue(F.RUN_PDF),error:r.getValue(F.RUN_ERR),
            reportId:r.getValue(F.RUN_RPT),
            started:r.getValue(F.RUN_STA),ended:r.getValue(F.RUN_END),
            mrTaskId:r.getValue(F.RUN_MR)});
          return hrows.length<200;
        });
        return jsonResp(res,200,{ok:true,data:hrows});
      }

      if(action==='files.download'){
        try{var f=file.load({id:req.parameters.fileId});res.writeFile({file:f,isInline:true});return;}
        catch(e){return jsonResp(res,404,{ok:false,error:'File not found: '+e.message});}
      }


      if(action==='ai.suggest'&&method==='POST'){
        var sc2=runtime.getCurrentScript();
        // API key must be set in NetSuite Script Parameter: custscript_sf_azure_key
        var azKey=(sc2.getParameter({name:'custscript_sf_azure_key'})||'').toString().trim();
        // Optional overrides — defaults match the configured Azure deployment
        var azEp=(sc2.getParameter({name:'custscript_sf_azure_ep'})||'https://elevaite-2026.cognitiveservices.azure.com').toString().trim().replace(/\/+$/,'');
        var azDep=(sc2.getParameter({name:'custscript_sf_azure_dep'})||'hackathon-model-grp-02').toString().trim();
        var azVer=(sc2.getParameter({name:'custscript_sf_azure_ver'})||'2024-02-01').toString().trim();
        if(!azKey) return jsonResp(res,400,{ok:false,error:'Azure AI key not configured — set the custscript_sf_azure_key Script Parameter on the Suitelet deployment.'});
        var sysPrompts={
          map:'You are a NetSuite field mapping assistant. Given output column labels and source column names, return ONLY a JSON object where keys are "sourceId::outputKey" and values are the best-matching source column label. If no match, omit the key. No explanation, no markdown, only raw JSON.',
          formula:'You are a formula expression builder for a data transformation tool. Column values are referenced as {column_key}. Supported: arithmetic (+,-,*,/), IF(cond,then,else), CONCAT(a,b,...), COALESCE(a,b,...), ROUND(n,d), ABS(n), MAX(a,b), MIN(a,b), UPPER(s), LOWER(s), TRIM(s), LEN(s), LEFT(s,n), RIGHT(s,n). Return ONLY the formula string, no explanation, no quotes.',
          flag:'You are a conditional expression builder. Column values are referenced as {column_key}. Operators: > < >= <= == != AND OR NOT. String literals use single quotes. Return ONLY the condition expression string, no explanation, no quotes.',
          insights:'You are a data analyst. Given a preview of business report results including row counts, column totals, flag counts, and anomalies, write a concise 3-5 sentence executive summary highlighting key findings, concerns, and patterns. Plain prose, no bullet points, no markdown.'
        };
        var sys=sysPrompts[body.task]||'You are a helpful assistant. Be concise.';
        // Azure OpenAI Chat Completions: POST {endpoint}/openai/deployments/{deployment}/chat/completions?api-version={ver}
        var azUrl=azEp+'/openai/deployments/'+azDep+'/chat/completions?api-version='+azVer;
        var resp=https.post({
          url:azUrl,
          headers:{'api-key':azKey,'Content-Type':'application/json'},
          body:JSON.stringify({
            model:azDep,
            messages:[{role:'system',content:sys},{role:'user',content:String(body.prompt||'')}],
            max_completion_tokens:1024
          })
        });
        if(resp.code!==200){
          var azErrMsg='Azure OpenAI error '+resp.code;
          try{var er=JSON.parse(resp.body);if(er.error&&er.error.message)azErrMsg=er.error.message;}catch(e2){}
          throw new Error(azErrMsg);
        }
        var rd=JSON.parse(resp.body);
        var txt=rd.choices&&rd.choices[0]&&rd.choices[0].message&&rd.choices[0].message.content||'';
        return jsonResp(res,200,{ok:true,data:{text:txt,task:body.task}});
      }

      /* ai.semmap — semantic field mapping via Azure Embeddings + cosine similarity */
      if(action==='ai.semmap'&&method==='POST'){
        var sc3=runtime.getCurrentScript();
        var azKey3=(sc3.getParameter({name:'custscript_sf_azure_key'})||'').toString().trim();
        var azEp3=(sc3.getParameter({name:'custscript_sf_azure_ep'})||'https://elevaite-2026.cognitiveservices.azure.com').toString().trim().replace(/\/+$/,'');
        var azEmbDep=(sc3.getParameter({name:'custscript_sf_azure_emb_dep'})||'hackathon-embed-grp-02').toString().trim();
        var azVer3=(sc3.getParameter({name:'custscript_sf_azure_ver'})||'2024-02-01').toString().trim();
        if(!azKey3) return jsonResp(res,400,{ok:false,error:'Azure AI key not configured — set custscript_sf_azure_key.'});

        var outputCols=body.outputCols||[];   // [{key, label}]
        var sources=body.sources||[];         // [{id, name, columns:[label,...]}]
        var threshold=parseFloat(body.threshold||'0.70');
        if(!outputCols.length||!sources.length)
          return jsonResp(res,400,{ok:false,error:'Missing outputCols or sources'});

        // Build flat list of all labels to embed in one batch
        var outputLabels=outputCols.map(function(c){return c.label;});
        var srcFlat=[], srcMeta=[];
        sources.forEach(function(src){
          (src.columns||[]).forEach(function(lbl){
            srcFlat.push(lbl);
            srcMeta.push({sourceId:src.id,label:lbl});
          });
        });
        var allTexts=outputLabels.concat(srcFlat);
        if(!allTexts.length) return jsonResp(res,200,{ok:true,data:{}});

        // Azure Embeddings API: POST {endpoint}/openai/deployments/{deployment}/embeddings?api-version={ver}
        var embUrl=azEp3+'/openai/deployments/'+azEmbDep+'/embeddings?api-version='+azVer3;
        var embResp=https.post({
          url:embUrl,
          headers:{'api-key':azKey3,'Content-Type':'application/json'},
          body:JSON.stringify({model:azEmbDep,input:allTexts})
        });
        if(embResp.code!==200){
          var embErrMsg='Azure Embedding API error '+embResp.code;
          try{var embEr=JSON.parse(embResp.body);if(embEr.error&&embEr.error.message)embErrMsg=embEr.error.message;}catch(embE2){}
          throw new Error(embErrMsg);
        }
        var embData=JSON.parse(embResp.body).data||[];
        // data is sorted by index — split back into output vs source embeddings
        var outEmbs=embData.slice(0,outputLabels.length).map(function(d){return d.embedding;});
        var srcEmbs=embData.slice(outputLabels.length).map(function(d){return d.embedding;});

        // Cosine similarity
        function cosSim(a,b){
          var dot=0,ma=0,mb=0;
          for(var i=0;i<a.length;i++){dot+=a[i]*b[i];ma+=a[i]*a[i];mb+=b[i]*b[i];}
          var denom=Math.sqrt(ma)*Math.sqrt(mb);
          return denom>0?dot/denom:0;
        }

        // For each output column, find the best-matching source label per source
        var suggestions={};
        outputCols.forEach(function(col,oi){
          var oEmb=outEmbs[oi];
          sources.forEach(function(src){
            var bestLabel=null,bestScore=threshold;
            srcMeta.forEach(function(sm,si){
              if(sm.sourceId!==src.id) return;
              var score=cosSim(oEmb,srcEmbs[si]);
              if(score>bestScore){bestScore=score;bestLabel=sm.label;}
            });
            if(bestLabel) suggestions[src.id+'::'+col.key]=bestLabel;
          });
        });
        return jsonResp(res,200,{ok:true,data:suggestions});
      }

      /* dedupe rules */
      if(action==='dedupe.upsert'&&method==='POST'){
        var ddids=[];
        try{
          search.create({type:RECORDS.DEDUPE,filters:[[F.DD_RPT,'anyof',body.reportId]],columns:['internalid']})
            .run().each(function(r){ddids.push(r.getValue('internalid'));return true;});
        }catch(e){}
        ddids.forEach(function(id){try{record.delete({type:RECORDS.DEDUPE,id:id});}catch(e){}});
        (body.rules||[]).forEach(function(d){
          var dr=record.create({type:RECORDS.DEDUPE});
          dr.setValue({fieldId:F.DD_RPT,  value:body.reportId});
          dr.setValue({fieldId:F.DD_FLDS, value:d.fields||''});
          dr.setValue({fieldId:F.DD_STG,  value:d.strategy||'FIRST'});
          dr.setValue({fieldId:F.DD_CMP,  value:d.compareField||''});
          dr.setValue({fieldId:F.DD_EN,   value:d.enabled!==false});
          dr.save();
        });
        return jsonResp(res,200,{ok:true,data:{count:(body.rules||[]).length}});
      }

      /* schedules */
      if(action==='schedules.get'){
        var scrows=[];
        search.create({type:RECORDS.SCHEDULE,
          filters:[[F.SC_RPT,'anyof',req.parameters.reportId]],
          columns:['internalid',F.SC_ACT,F.SC_FREQ,F.SC_DOW,F.SC_DOM,F.SC_HOUR,
                   F.SC_NRUN,F.SC_LRUN,F.SC_RECP,F.SC_FOLD,F.SC_FMTS,F.SC_RF,
                   F.SC_SUBJ,F.SC_BODY,F.SC_CINT,F.SC_CIUN]
        }).run().each(function(r){
          scrows.push({
            id:r.getValue('internalid'),
            active:r.getValue(F.SC_ACT)===true||r.getValue(F.SC_ACT)==='T',
            frequency:r.getValue(F.SC_FREQ)||'DAILY',
            dayOfWeek:r.getValue(F.SC_DOW)||'',dayOfMonth:r.getValue(F.SC_DOM)||'',
            hour:r.getValue(F.SC_HOUR)||'',nextRun:r.getValue(F.SC_NRUN)||'',
            lastRun:r.getValue(F.SC_LRUN)||'',recipients:r.getValue(F.SC_RECP)||'',
            folderId:r.getValue(F.SC_FOLD)||'',formats:r.getValue(F.SC_FMTS)||'',
            runtimeFilters:r.getValue(F.SC_RF)||'',
            emailSubject:r.getValue(F.SC_SUBJ)||'',emailBody:r.getValue(F.SC_BODY)||'',
            customInterval:parseInt(r.getValue(F.SC_CINT)||'0',10)||1,
            customUnit:r.getValue(F.SC_CIUN)||'HOURS'
          });
          return true;
        });
        return jsonResp(res,200,{ok:true,data:scrows});
      }

      if(action==='schedules.upsert'&&method==='POST'){
        if(!body.reportId) return jsonResp(res,400,{ok:false,error:'Missing reportId'});
        // delete existing schedules for report, then recreate
        var scExist=[];
        try{
          search.create({type:RECORDS.SCHEDULE,filters:[[F.SC_RPT,'anyof',body.reportId]],columns:['internalid']})
            .run().each(function(r){scExist.push(r.getValue('internalid'));return true;});
        }catch(e){}
        scExist.forEach(function(id){try{record.delete({type:RECORDS.SCHEDULE,id:id});}catch(e){}});
        var sc=body.schedule||{};
        var sr2=record.create({type:RECORDS.SCHEDULE});
        sr2.setValue({fieldId:F.SC_RPT,  value:body.reportId});
        sr2.setValue({fieldId:F.SC_ACT,  value:sc.active!==false});
        sr2.setValue({fieldId:F.SC_FREQ, value:sc.frequency||'DAILY'});
        sr2.setValue({fieldId:F.SC_DOW,  value:sc.dayOfWeek||''});
        sr2.setValue({fieldId:F.SC_DOM,  value:sc.dayOfMonth||''});
        sr2.setValue({fieldId:F.SC_HOUR, value:sc.hour||''});
        sr2.setValue({fieldId:F.SC_NRUN, value:sc.nextRun||''});
        sr2.setValue({fieldId:F.SC_RECP, value:sc.recipients||''});
        sr2.setValue({fieldId:F.SC_FOLD, value:sc.folderId||''});
        sr2.setValue({fieldId:F.SC_FMTS, value:sc.formats||''});
        sr2.setValue({fieldId:F.SC_RF,   value:sc.runtimeFilters||''});
        sr2.setValue({fieldId:F.SC_SUBJ, value:sc.emailSubject||''});
        sr2.setValue({fieldId:F.SC_BODY, value:sc.emailBody||''});
        sr2.setValue({fieldId:F.SC_CINT, value:sc.customInterval||0});
        sr2.setValue({fieldId:F.SC_CIUN, value:sc.customUnit||'HOURS'});
        return jsonResp(res,200,{ok:true,data:{id:sr2.save()}});
      }

      /* reports.validate */
      if(action==='reports.validate'){
        var vpid=req.parameters.reportId;
        if(!vpid) return jsonResp(res,400,{ok:false,error:'Missing reportId'});
        var verrs=[],vwarns=[];
        try {
          var vrpt=loadReport(vpid);
          var enSrcs=vrpt.sources.filter(function(s){return s.enabled;});
          if(!enSrcs.length) verrs.push({code:'NO_SOURCES',msg:'No enabled sources configured.'});
          enSrcs.forEach(function(src){
            if(!src.savedSearchId) verrs.push({code:'MISSING_SSID',msg:'Source "'+src.name+'" is missing a Saved Search ID.'});
            if(src.filterJson){try{JSON.parse(src.filterJson);}catch(fe){verrs.push({code:'BAD_FILTER_JSON',msg:'Source "'+src.name+'" has invalid filter JSON: '+fe.message});}}
          });
          if(!vrpt.columns.length) vwarns.push({code:'NO_COLUMNS',msg:'No output columns defined.'});
          var colKeys={};
          vrpt.columns.forEach(function(col){
            if(!col.key){ verrs.push({code:'MISSING_COL_KEY',msg:'A column is missing its key (label: "'+col.label+'")'}); return; }
            if(colKeys[col.key]) vwarns.push({code:'DUPLICATE_KEY',msg:'Duplicate column key: "'+col.key+'"'});
            colKeys[col.key]=true;
            if(col.type==='COMPUTED'&&!col.formula) vwarns.push({code:'COMPUTED_NO_FORMULA',msg:'Computed column "'+col.key+'" has no formula.'});
            if(col.type==='COMPUTED'&&col.formula){
              var tr2=evalFormula(col.formula,{});
              if(ss(tr2).slice(0,5)==='#ERR:') vwarns.push({code:'FORMULA_ERR',msg:'Column "'+col.key+'" formula error: '+ss(tr2).slice(5)});
            }
          });
          var ck=Object.keys(colKeys);
          if(vrpt.mergeMode==='JOIN'){
            var primArr=enSrcs.filter(function(s){return s.joinType==='PRIMARY';});
            if(!primArr.length) verrs.push({code:'JOIN_NO_PRIMARY',msg:'JOIN mode requires one source set as PRIMARY.'});
            if(primArr.length>1) vwarns.push({code:'JOIN_MULTI_PRIMARY',msg:'Multiple sources set as PRIMARY; only the first is used.'});
            enSrcs.filter(function(s){return s.joinType!=='PRIMARY'&&s.joinType!=='APPEND';}).forEach(function(src){
              if(!src.joinKey) vwarns.push({code:'NO_JOIN_KEY',msg:'Source "'+src.name+'" has no join key configured.'});
            });
          }
          if(vrpt.mergeMode==='SMART'){
            if(!vrpt.mergeKey) verrs.push({code:'SMART_NO_KEY',msg:'SMART mode requires a Merge Key to be set.'});
            else if(ck.indexOf(vrpt.mergeKey)<0) verrs.push({code:'SMART_BAD_KEY',msg:'Merge key "'+vrpt.mergeKey+'" does not match any column key.'});
          }
          if(vrpt.sortKeys){
            vrpt.sortKeys.split(',').map(function(k){return k.trim();}).filter(Boolean).forEach(function(k){
              if(ck.indexOf(k)<0) vwarns.push({code:'BAD_SORT_KEY',msg:'Sort key "'+k+'" not found in column keys.'});
            });
          }
          if(vrpt.dedupeKey){
            vrpt.dedupeKey.split('|').map(function(k){return k.trim();}).filter(Boolean).forEach(function(k){
              if(ck.indexOf(k)<0) vwarns.push({code:'BAD_DEDUPE_KEY',msg:'Dedupe key "'+k+'" not found in column keys.'});
            });
          }
          vrpt.flags.forEach(function(fl){
            if(!fl.condition) vwarns.push({code:'FLAG_NO_COND',msg:'Flag rule "'+fl.name+'" has no condition expression.'});
          });
          vrpt.pivots.forEach(function(pv){
            var lbl=pv.label||'(unnamed)';
            if(!pv.groupKey) vwarns.push({code:'PIVOT_NO_GROUP',msg:'Pivot "'+lbl+'" has no group-by column.'});
            else if(ck.indexOf(pv.groupKey)<0) vwarns.push({code:'PIVOT_BAD_GROUP',msg:'Pivot "'+lbl+'" group key "'+pv.groupKey+'" not in column keys.'});
            if(pv.aggFunc!=='COUNT'&&!pv.aggKey) vwarns.push({code:'PIVOT_NO_AGG',msg:'Pivot "'+lbl+'" ('+pv.aggFunc+') needs an aggregate column.'});
            else if(pv.aggKey&&ck.indexOf(pv.aggKey)<0) vwarns.push({code:'PIVOT_BAD_AGG',msg:'Pivot "'+lbl+'" agg key "'+pv.aggKey+'" not in column keys.'});
          });
          return jsonResp(res,200,{ok:true,data:{valid:verrs.length===0,errors:verrs,warnings:vwarns}});
        } catch(e){ return apiErr(res,e); }
      }

      return jsonResp(res,400,{ok:false,error:'Unknown action: '+action});
    } catch(e){ return apiErr(res,e); }
  }



  function renderUi(res) {
    res.setHeader({name:'Content-Type',value:'text/html; charset=utf-8'});
    var CSS_VAR = "\n*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}\nhtml,body{height:100%;}\n:root{--ns-blue:#205081;--ns-blue-dark:#123860;--ns-gold:#ffd65a;--ns-border:#d7dbe4;--ns-border-dark:#c0c9d6;--ns-border-soft:#e7eaf1;--ns-bg:#f6f8fb;--ns-panel:#fff;--ns-panel-alt:#fbfcff;--ns-text:#1d2a3b;--ns-muted:#5b6675;--ns-accent:#0070c0;--ns-accent-dark:#005799;--ns-success:#0d7a3c;--ns-warning:#c47f00;--ns-danger:#b3261e;--ns-pill-bg:#eef2fa;--radius:6px;--radius-lg:10px;--font:'Segoe UI',Arial,sans-serif;--mono:'Consolas','Courier New',monospace;--shadow-soft:0 2px 4px rgba(15,42,78,.08);}\nbody{font-family:var(--font);background:var(--ns-bg);color:var(--ns-text);font-size:13px;line-height:1.45;-webkit-font-smoothing:antialiased;}\n.layout{display:flex;min-height:100vh;}\n.sidebar{width:220px;flex-shrink:0;background:linear-gradient(180deg,#1f4674 0%,#15345a 100%);color:#fff;border-right:1px solid rgba(0,0,0,.25);box-shadow:inset -1px 0 0 rgba(255,255,255,.12);display:flex;flex-direction:column;padding:18px 0;}\n.logo{padding:0 18px 18px;margin-bottom:10px;border-bottom:1px solid rgba(255,255,255,.2);font-weight:600;font-size:15px;letter-spacing:.3px;display:flex;align-items:center;gap:8px;}\n.nav-btn{display:flex;align-items:center;gap:10px;padding:9px 20px;color:rgba(255,255,255,.82);font-size:13px;font-weight:600;border:none;background:none;text-align:left;cursor:pointer;transition:background .15s,color .15s;}\n.nav-btn svg{color:inherit;}\n.nav-btn:hover{background:rgba(255,255,255,.15);color:#fff;}\n.nav-btn.active{background:rgba(0,0,0,.2);color:#fff;box-shadow:inset 3px 0 0 var(--ns-gold);}\n.main{flex:1;padding:28px 32px 40px;background:linear-gradient(180deg,#fefefe 0%,var(--ns-bg) 65%);}\n.card{background:var(--ns-panel);border:1px solid var(--ns-border);border-radius:var(--radius);padding:20px;margin-bottom:20px;box-shadow:var(--shadow-soft);}\n.card-title{font-weight:600;font-size:12px;text-transform:uppercase;letter-spacing:.4px;color:var(--ns-muted);margin-bottom:12px;}\n.row{display:flex;gap:12px;flex-wrap:wrap;align-items:flex-end;}\n.field{flex:1;min-width:180px;}\nlabel{display:block;font-size:12px;font-weight:600;color:#2d3d54;margin-bottom:4px;}\ninput,select,textarea{width:100%;padding:7px 10px;border:1px solid var(--ns-border);border-radius:var(--radius);background:#fff;font-family:var(--font);font-size:13px;color:var(--ns-text);transition:border-color .12s,box-shadow .12s;}\ninput:focus,select:focus,textarea:focus{border-color:var(--ns-accent);box-shadow:0 0 0 1px rgba(0,112,192,.2);}\ntextarea{min-height:70px;font-family:var(--mono);font-size:12px;resize:vertical;}\nbutton{display:inline-flex;align-items:center;gap:6px;padding:7px 14px;font-size:12px;font-weight:600;border-radius:var(--radius);border:1px solid var(--ns-border);background:var(--ns-panel-alt);color:var(--ns-text);cursor:pointer;transition:background .12s,border-color .12s,box-shadow .12s;}\nbutton:hover{background:#f0f3f8;border-color:var(--ns-border-dark);}\nbutton:disabled{opacity:.55;cursor:not-allowed;box-shadow:none;}\nbutton.primary{background:var(--ns-accent);border-color:var(--ns-accent);color:#fff;}\nbutton.primary:hover{background:var(--ns-accent-dark);}\nbutton.danger{background:#fff2f0;border-color:#f7c7c3;color:var(--ns-danger);}\nbutton.danger:hover{background:#ffe3df;}\nbutton.sm{padding:4px 10px;font-size:11px;}\nbutton.icon-btn{border:none;background:transparent;color:var(--ns-muted);padding:4px 6px;font-size:16px;}\nbutton.icon-btn:hover{color:var(--ns-text);background:rgba(27,42,59,.08);border-radius:var(--radius);}\n.tw{overflow:auto;border-radius:var(--radius);border:1px solid var(--ns-border);background:var(--ns-panel);}\ntable{width:100%;border-collapse:separate;border-spacing:0;font-size:12px;}\nth{background:#edf1f7;color:#1f2a3c;font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:.4px;padding:8px 10px;border-bottom:1px solid var(--ns-border);border-right:1px solid var(--ns-border-soft);}\nth:last-child{border-right:none;}\ntd{padding:8px 10px;border-bottom:1px solid var(--ns-border-soft);border-right:1px solid var(--ns-border-soft);vertical-align:middle;background:#fff;}\ntd:last-child{border-right:none;}\ntr:last-child td{border-bottom:none;}\ntr:hover td{background:#f7fafc;}\ntd input,td select{background:transparent;border-color:transparent;padding:3px 4px;}\ntd input:focus,td select:focus{background:#fff;border-color:var(--ns-accent);}\n.pill{display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:600;border:1px solid transparent;background:var(--ns-pill-bg);color:var(--ns-muted);}\n.pill-q{background:#fff6e0;color:var(--ns-warning);border-color:#f6d7a4;}\n.pill-r{background:#e3f1ff;color:var(--ns-accent);border-color:#b5d7f6;}\n.pill-s{background:#e2f5eb;color:var(--ns-success);border-color:#b7e1c8;}\n.pill-f{background:#ffe5e2;color:var(--ns-danger);border-color:#ffbdb2;}\n.pill-d{background:#eef0f5;color:var(--ns-muted);border-color:var(--ns-border);}\n.badge{display:inline-flex;align-items:center;padding:2px 7px;border-radius:999px;font-size:10px;font-weight:700;margin-left:8px;border:1px solid var(--ns-border-soft);background:#f2f5fb;color:var(--ns-muted);}\n.badge-primary{background:#e3f0ff;color:var(--ns-accent);border-color:#b6d3f6;}\n.badge-left{background:#e2f5eb;color:var(--ns-success);border-color:#b7e1c8;}\n.badge-inner{background:#fff6e0;color:var(--ns-warning);border-color:#f6d7a4;}\n.badge-append{background:#eef0f5;color:var(--ns-muted);border-color:var(--ns-border);}\n.mono{font-family:var(--mono);}\n.muted{color:var(--ns-muted);}\n.etxt{color:var(--ns-danger);font-size:12px;margin-top:6px;}\n.empty{color:var(--ns-muted);text-align:center;padding:24px 0;line-height:1.7;}\n.run-empty{padding:40px 0;font-size:14px;color:var(--ns-muted);}\n.ptitle{font-size:18px;font-weight:700;margin-bottom:16px;color:var(--ns-text);}\n.spin{display:inline-block;width:14px;height:14px;border:2px solid var(--ns-border);border-top-color:var(--ns-accent);border-radius:50%;animation:sp .8s linear infinite;}\n@keyframes sp{to{transform:rotate(360deg);}}\n.loading-row{display:flex;align-items:center;gap:8px;padding:14px;color:var(--ns-muted);}\n#toasts{position:fixed;bottom:24px;right:24px;display:flex;flex-direction:column;gap:10px;z-index:9999;}\n.toast{padding:10px 16px;border-radius:var(--radius);font-size:13px;font-weight:600;min-width:240px;max-width:360px;border:1px solid var(--ns-border);background:#fff;box-shadow:0 4px 14px rgba(15,42,78,.15);animation:tslide .2s ease;}\n.toast-s{border-color:#b7e1c8;background:#e8f6ed;color:var(--ns-success);}\n.toast-e{border-color:#f7c7c3;background:#ffeceb;color:var(--ns-danger);}\n.toast-i{border-color:#b6d3f6;background:#eaf3ff;color:var(--ns-accent);}\n@keyframes tslide{from{transform:translateY(8px);opacity:0;}}\n.modal-ov{position:fixed;inset:0;background:rgba(10,19,33,.5);display:flex;align-items:center;justify-content:center;z-index:9000;}\n.modal{background:var(--ns-panel);border:1px solid var(--ns-border);border-radius:var(--radius-lg);padding:24px;width:720px;max-width:95vw;max-height:90vh;display:flex;flex-direction:column;gap:14px;box-shadow:0 18px 45px rgba(10,19,33,.25);}\n.modal-wide{width:1100px;}\n.modal-hd{display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--ns-border);padding-bottom:10px;margin-bottom:6px;}\n.modal-footer{display:flex;justify-content:flex-end;padding-top:12px;border-top:1px solid var(--ns-border);}\n.ss-browser{display:flex;gap:14px;flex:1;min-height:0;}\n.ss-left{width:320px;flex-shrink:0;display:flex;flex-direction:column;gap:10px;}\n.ss-right{flex:1;overflow:auto;}\n.ss-list{flex:1;border:1px solid var(--ns-border);border-radius:var(--radius);overflow:auto;background:#fff;}\n.ss-row{padding:10px 14px;border-bottom:1px solid var(--ns-border-soft);cursor:pointer;transition:background .1s;}\n.ss-row:last-child{border-bottom:none;}\n.ss-row:hover,.ss-sel{background:#eaf3ff!important;}\n.ss-row-name{font-weight:600;font-size:13px;color:var(--ns-text);}\n.ss-row-meta{font-size:11px;font-family:var(--mono);color:var(--ns-muted);margin-top:2px;}\n.detail-hdr{display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:12px;gap:8px;}\n.cp-list-wrap{flex:1;overflow:auto;border:1px solid var(--ns-border);border-radius:var(--radius);background:#fff;}\n.cp-list{padding:4px 0;}\n.cp-row{display:flex;align-items:center;gap:10px;padding:9px 14px;border-bottom:1px solid var(--ns-border-soft);cursor:pointer;transition:background .1s;}\n.cp-row:last-child{border-bottom:none;}\n.cp-row:hover{background:#f4f8ff;}\n.cp-dim{opacity:.6;cursor:default;pointer-events:none;}\n.merge-toggle{display:inline-flex;border:1px solid var(--ns-border);border-radius:var(--radius);overflow:hidden;background:#fff;}\n.merge-opt{border:none;border-radius:0;padding:6px 18px;font-size:12px;font-weight:600;color:var(--ns-muted);background:transparent;}\n.merge-opt.active{background:#eaf3ff;color:var(--ns-accent);box-shadow:inset 0 0 0 1px rgba(0,112,192,.1);}\n.merge-opt:hover:not(.active){background:#f4f6fb;}\n.settings-merge-row{display:flex;align-items:center;gap:10px;flex-wrap:wrap;}\n.settings-label{font-size:11px;font-weight:600;color:var(--ns-muted);text-transform:uppercase;letter-spacing:.4px;}\n.hint-wrap{margin-top:8px;}\n.hint-text{font-size:11px;color:var(--ns-muted);line-height:1.5;}\n.src-card{background:#fff;border:1px solid var(--ns-border);border-radius:var(--radius);padding:14px;margin-bottom:12px;box-shadow:var(--shadow-soft);}\n.src-card:last-of-type{margin-bottom:0;}\n.src-card-primary{border-color:#b6d3f6;background:#f4f8ff;}\n.src-card-hdr{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;}\n.src-card-badges{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-left:6px;}\n.src-actions{display:flex;gap:8px;margin-top:12px;padding-top:12px;border-top:1px solid var(--ns-border-soft);}\n.join-row{display:flex;gap:10px;flex-wrap:wrap;background:#f4f6fb;border:1px solid var(--ns-border);border-radius:var(--radius);padding:10px;margin-top:10px;}\n.flag-row{display:flex;gap:10px;align-items:flex-start;margin-bottom:10px;padding:12px;border-radius:var(--radius);border:1px solid var(--ns-border-soft);background:#fdfdfd;}\n.flag-row:last-child{margin-bottom:0;}\n.flagged-row td{background:#fff6e0!important;}\n.tab-bar{display:flex;gap:2px;border-bottom:1px solid var(--ns-border);margin-bottom:14px;}\n.tab-btn{border:none;border-bottom:3px solid transparent;border-radius:0;padding:8px 14px;color:var(--ns-muted);background:none;font-size:12px;font-weight:600;}\n.tab-btn:hover{color:var(--ns-text);background:#f4f6fb;}\n.tab-btn.active{color:var(--ns-accent);border-bottom-color:var(--ns-accent);background:transparent;}\n.udot{width:7px;height:7px;border-radius:50%;background:var(--ns-warning);flex-shrink:0;display:none;}\n.pager{display:flex;align-items:center;gap:8px;}\n.map-grid td input{min-width:130px;}\n.diag-pre{white-space:pre-wrap;background:#fff;border:1px solid var(--ns-border);border-radius:var(--radius);padding:12px;font-size:12px;font-family:var(--mono);margin-top:8px;max-height:320px;overflow:auto;}\n.ai-btn{background:#f3edff;border-color:#d4c7f7;color:#6b46c1;}\n.ai-btn:hover{background:#e9dfff;}\n.ai-btn:disabled{opacity:.6;}\n.ai-key-banner{margin-top:14px;padding:10px 14px;background:#f3edff;border:1px solid #d4c7f7;border-radius:var(--radius);font-size:12px;line-height:1.5;color:#4c338a;}\n.val-panel{border-radius:var(--radius);overflow:hidden;border:1px solid var(--ns-border);}\n.val-item{display:flex;align-items:flex-start;gap:10px;padding:10px 14px;border-bottom:1px solid var(--ns-border-soft);background:#fff;}\n.val-item:last-child{border-bottom:none;}\n.val-err{background:#ffeceb;}\n.val-warn{background:#fff6e0;}\n.val-ok{padding:14px;background:#e8f6ed;border:1px solid #b7e1c8;border-radius:var(--radius);color:var(--ns-success);font-weight:600;}\n.val-code{font-family:var(--mono);font-size:11px;background:#f4f6fb;border-radius:4px;padding:2px 6px;margin-top:3px;display:inline-block;}\n.val-icon{flex-shrink:0;font-weight:700;font-size:14px;margin-top:1px;}\n::-webkit-scrollbar{width:6px;height:6px;}\n::-webkit-scrollbar-track{background:transparent;}\n::-webkit-scrollbar-thumb{background:var(--ns-border-dark);border-radius:3px;}\n::-webkit-scrollbar-thumb:hover{background:var(--ns-blue);}\nbutton.primary.danger{background:#cc1f1a;border-color:#a31615;}\nbutton.primary.danger:hover{background:#b31210;}\n.tab-cnt{display:inline-block;background:#fff6e0;color:var(--ns-warning);border-radius:999px;font-size:10px;font-weight:700;padding:1px 6px;margin-left:4px;}\n.ord-wrap{display:inline-flex;flex-direction:column;gap:1px;margin-right:4px;vertical-align:middle;}\n.ord-wrap button{padding:1px 5px;font-size:10px;line-height:1.2;min-width:20px;border-radius:4px;background:#f4f6fb;border:1px solid var(--ns-border);}\n.rep-filter{max-width:320px;margin-bottom:14px;}\n";
    var CLIENT_VAR = "/* \u2550\u2550 Utils \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550 */\nfunction esc(s){return String(s==null?\"\":s).replace(/&/g,\"&amp;\").replace(/</g,\"&lt;\").replace(/>/g,\"&gt;\").replace(/\"/g,\"&quot;\").replace(/'/g,\"&#39;\");}\nfunction toast(type,msg,ms){ms=ms||3500;var e=document.createElement(\"div\");e.className=\"toast toast-\"+type;e.textContent=(type===\"s\"?\"\u2713 \":type===\"e\"?\"\u2715 \":\"\u2139 \")+String(msg);document.getElementById(\"toasts\").appendChild(e);setTimeout(function(){e.remove();},ms);}\nfunction spin(btn){if(!btn)return;btn._t=btn.innerHTML;btn.innerHTML='<span class=\"spin\"></span>';btn.disabled=true;}\nfunction unspin(btn){if(!btn)return;btn.innerHTML=btn._t||btn.innerHTML;btn.disabled=false;}\nfunction el(tag,attrs,children){\n  var e=document.createElement(tag);\n  if(attrs)Object.keys(attrs).forEach(function(k){\n    if(k===\"cls\")e.className=attrs[k];else if(k===\"style\")e.style.cssText=attrs[k];\n    else if(k===\"txt\")e.textContent=attrs[k];else if(k===\"html\")e.innerHTML=attrs[k];\n    else if(k.startsWith(\"on\"))e.addEventListener(k.slice(2),attrs[k]);else e.setAttribute(k,attrs[k]);\n  });\n  if(children)children.forEach(function(c){if(c!=null)e.appendChild(typeof c===\"string\"?document.createTextNode(c):c);});\n  return e;\n}\nfunction qs(sel,r){return(r||document).querySelector(sel);}\nfunction qsa(sel,r){return Array.from((r||document).querySelectorAll(sel));}\nfunction slugify(s){return String(s).toLowerCase().trim().replace(/[^a-z0-9]+/g,\"_\").replace(/^_+|_+$/g,\"\");}\n\n/* \u2550\u2550 API \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550 */\nfunction baseUrl(){return window.location.href.split(\"#\")[0];}\nfunction apiUrl(action,params){var u=new URL(baseUrl());u.searchParams.set(\"action\",action);if(params)Object.keys(params).forEach(function(k){u.searchParams.set(k,params[k]);});return u.toString();}\nasync function apiGet(action,params){var r=await fetch(apiUrl(action,params),{credentials:\"same-origin\"});var j=await r.json();if(!j.ok)throw new Error(j.error||\"API error\");return j.data;}\nasync function apiPost(action,body){var r=await fetch(apiUrl(action),{method:\"POST\",credentials:\"same-origin\",headers:{\"Content-Type\":\"application/json\"},body:JSON.stringify(body||{})});var j=await r.json();if(!j.ok)throw new Error(j.error||\"API error\");return j.data;}\n\n/* \u2550\u2550 Router \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550 */\nvar app=document.getElementById(\"app\");\nfunction navTo(path,params){var q=new URLSearchParams(params||{}).toString();location.hash=\"#\"+path+(q?\"?\"+q:\"\");}\nfunction route(){var hash=window.location.hash||\"#/reports\";var parts=hash.slice(1).split(\"?\");return{path:parts[0],params:new URLSearchParams(parts[1]||\"\")};}\nfunction setSidebarActive(path){qsa(\".nav-btn[data-route]\").forEach(function(b){b.classList.toggle(\"active\",b.dataset.route===path);});}\nfunction statusPill(s){var cls={SUCCESS:\"s\",FAILED:\"f\",RUNNING:\"r\",QUEUED:\"q\"}[(s||\"\").toUpperCase()]||\"d\";var e=el(\"span\",{cls:\"pill pill-\"+cls});if((s||\"\").toUpperCase()===\"RUNNING\")e.appendChild(el(\"span\",{cls:\"spin\",style:\"width:8px;height:8px;border-width:1.5px\"}));e.appendChild(document.createTextNode(s||\"-\"));return e.outerHTML;}\n\n/* \u2550\u2550 Modal \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550 */\nfunction closeModal(){var ov=qs(\".modal-ov\");if(ov)ov.remove();}\nfunction openModal(m){closeModal();var ov=el(\"div\",{cls:\"modal-ov\"},[m]);ov.addEventListener(\"click\",function(e){if(e.target===ov)closeModal();});document.body.appendChild(ov);}\nfunction openConfirm(msg,onConfirm,opts){var closeBtn=el(\"button\",{cls:\"icon-btn\",txt:\"\u2715\"});closeBtn.addEventListener(\"click\",closeModal);var noBtn=el(\"button\",{txt:\"Cancel\"});noBtn.addEventListener(\"click\",closeModal);var yesBtn=el(\"button\",{cls:\"primary danger\",txt:(opts&&opts.ok)||\"Delete\"});yesBtn.addEventListener(\"click\",function(){closeModal();onConfirm();});var m=el(\"div\",{cls:\"modal\"},[el(\"div\",{cls:\"modal-hd\"},[el(\"strong\",{txt:(opts&&opts.title)||\"Confirm\"}),closeBtn]),el(\"p\",{style:\"padding:14px 0;line-height:1.7;color:var(--txt)\",txt:msg}),el(\"div\",{cls:\"modal-footer\",style:\"gap:8px\"},[noBtn,yesBtn])]);openModal(m);}\n\n/* \u2550\u2550 Saved Search Browser \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550 */\nfunction showSearchBrowser(opts){\n  var filterInp=el(\"input\",{placeholder:\"Filter by name, ID or record type\u2026\",style:\"width:100%;margin-bottom:10px\"});\n  var listDiv=el(\"div\",{cls:\"ss-list\"});\n  var detailDiv=el(\"div\",{cls:\"ss-right\"});\n  var closeBtn=el(\"button\",{cls:\"icon-btn\",txt:\"\u2715\"});closeBtn.addEventListener(\"click\",closeModal);\n  var allSearches=[],selectedSsid=null;\n  function renderList(searches){\n    listDiv.innerHTML=\"\";\n    if(!searches.length){listDiv.appendChild(el(\"div\",{cls:\"empty\",txt:\"No saved searches found.\"}));return;}\n    searches.forEach(function(s){\n      var row=el(\"div\",{cls:\"ss-row\"+(s.id===selectedSsid?\" ss-sel\":\"\")});\n      row.appendChild(el(\"div\",{cls:\"ss-row-name\",txt:s.name}));\n      row.appendChild(el(\"div\",{cls:\"ss-row-meta\",txt:s.id+(s.recordType?\" \u00b7 \"+s.recordType:\"\")}));\n      row.addEventListener(\"click\",function(){selectedSsid=s.id;qsa(\".ss-row\",listDiv).forEach(function(r){r.classList.remove(\"ss-sel\");});row.classList.add(\"ss-sel\");loadDetail(s);});\n      listDiv.appendChild(row);\n    });\n  }\n  async function loadDetail(s){\n    detailDiv.innerHTML=\"\";detailDiv.appendChild(el(\"div\",{cls:\"loading-row\"},[el(\"span\",{cls:\"spin\"}),\" Loading columns\u2026\"]));\n    try{var cols=await apiGet(\"sources.describe\",{savedSearchId:s.id});renderDetail(s,cols);}\n    catch(e){detailDiv.innerHTML=\"\";detailDiv.appendChild(el(\"div\",{cls:\"etxt\",txt:e.message}));}\n  }\n  function renderDetail(s,cols){\n    detailDiv.innerHTML=\"\";\n    var hdr=el(\"div\",{cls:\"detail-hdr\"});\n    hdr.appendChild(el(\"div\",{},[el(\"div\",{style:\"font-weight:700\",txt:s.name}),el(\"div\",{cls:\"muted mono\",style:\"font-size:11px\",txt:s.id})]));\n    if(opts&&opts.onSelect){var useBtn=el(\"button\",{cls:\"primary sm\",txt:\"+ Use as Source\"});useBtn.addEventListener(\"click\",function(){opts.onSelect(s.id,s.name,cols);closeModal();});hdr.appendChild(useBtn);}\n    detailDiv.appendChild(hdr);\n    if(!cols.length){detailDiv.appendChild(el(\"div\",{cls:\"empty\",txt:\"No columns returned.\"}));return;}\n    var tbody=el(\"tbody\");\n    cols.forEach(function(c){\n      var copyBtn=el(\"button\",{cls:\"sm\",txt:\"Copy\"});\n      copyBtn.addEventListener(\"click\",function(){navigator.clipboard&&navigator.clipboard.writeText(c.label||c.name).then(function(){toast(\"s\",\"Copied: \"+(c.label||c.name));});});\n      tbody.appendChild(el(\"tr\",{},[el(\"td\",{style:\"font-weight:600\",txt:c.label||c.name}),el(\"td\",{cls:\"mono muted\",txt:c.name}),el(\"td\",{cls:\"muted\",txt:c.join||\"\u2014\"}),el(\"td\",{},[copyBtn])]));\n    });\n    detailDiv.appendChild(el(\"div\",{cls:\"tw\"},[el(\"table\",{},[el(\"thead\",{},[el(\"tr\",{},[el(\"th\",{txt:\"Label\"}),el(\"th\",{txt:\"Field ID\"}),el(\"th\",{txt:\"Join\"}),el(\"th\",{txt:\"\"})])]),tbody])]));\n  }\n  filterInp.addEventListener(\"input\",function(){var q=filterInp.value.trim().toLowerCase();renderList(q?allSearches.filter(function(s){return(s.name+s.id+(s.recordType||\"\")).toLowerCase().includes(q);}):allSearches);});\n  var modal=el(\"div\",{cls:\"modal modal-wide\"},[el(\"div\",{cls:\"modal-hd\"},[el(\"strong\",{txt:(opts&&opts.title)||\"Saved Search Browser\"}),closeBtn]),el(\"div\",{cls:\"ss-browser\"},[el(\"div\",{cls:\"ss-left\"},[filterInp,listDiv]),detailDiv])]);\n  openModal(modal);\n  listDiv.appendChild(el(\"div\",{cls:\"loading-row\"},[el(\"span\",{cls:\"spin\"}),\" Loading\u2026\"]));\n  apiGet(\"searches.list\").then(function(data){allSearches=data;renderList(data);}).catch(function(e){listDiv.innerHTML=\"\";listDiv.appendChild(el(\"div\",{cls:\"etxt\",txt:e.message}));});\n}\n\n/* \u2550\u2550 Type guesser (global so column picker can use it) \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550 */\nfunction guessType(label,name){\n  var lc=(label+\" \"+(name||\"\")).toLowerCase();\n  if(/amount|total|subtotal|price|cost|rate|balance|revenue|tax/.test(lc))return\"CURRENCY\";\n  if(/qty|quantity|count|number|days|hours|percent|age/.test(lc))return\"NUMBER\";\n  if(/date|created|modified|closed|start|end/.test(lc))return\"DATE\";\n  return\"TEXT\";\n}\n\n/* \u2550\u2550 Column Picker \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550 */\nfunction showColumnPicker(allCols,existingLabels,onConfirm){\n  var filterInp=el(\"input\",{placeholder:\"Filter columns\u2026\",style:\"width:100%\"});\n  var selAllBtn=el(\"button\",{cls:\"sm\",txt:\"Select All\"});\n  var selNoneBtn=el(\"button\",{cls:\"sm\",txt:\"Clear\"});\n  var addSelBtn=el(\"button\",{cls:\"primary\",txt:\"Add Selected \u2192\"});addSelBtn.disabled=true;\n  var countSpan=el(\"span\",{cls:\"muted\",style:\"font-size:12px\"});\n  var closeBtn=el(\"button\",{cls:\"icon-btn\",txt:\"\u2715\"});closeBtn.addEventListener(\"click\",closeModal);\n  var state={};\n  allCols.forEach(function(c){state[c.label]={checked:false,type:guessType(c.label,c.name)};});\n  var listDiv=el(\"div\",{cls:\"cp-list\"});\n  function updateCount(){var n=Object.values(state).filter(function(s){return s.checked;}).length;countSpan.textContent=n?\" \"+n+\" selected\":\"\";addSelBtn.disabled=n===0;}\n  function renderList(filter){\n    listDiv.innerHTML=\"\";\n    var lc=(filter||\"\").toLowerCase();\n    var visible=lc?allCols.filter(function(c){return(c.label+c.name+(c.sourceName||\"\")).toLowerCase().includes(lc);}):allCols;\n    if(!visible.length){listDiv.appendChild(el(\"div\",{cls:\"empty\",txt:\"No columns match.\"}));return;}\n    visible.forEach(function(c){\n      var s=state[c.label];var already=!!existingLabels[(c.label||\"\").toLowerCase().trim()];\n      var chk=el(\"input\",{type:\"checkbox\"});chk.checked=s.checked;chk.disabled=already;\n      if(already)chk.title=\"Already added\";\n      chk.addEventListener(\"change\",function(){s.checked=chk.checked;updateCount();});\n      var typeSel=el(\"select\",{style:\"width:98px;padding:3px 5px;font-size:11px\"});\n      [\"TEXT\",\"NUMBER\",\"CURRENCY\",\"DATE\"].forEach(function(v){typeSel.appendChild(el(\"option\",{value:v,txt:v}));});typeSel.value=s.type;\n      typeSel.addEventListener(\"change\",function(){s.type=typeSel.value;});\n      var lbl=el(\"div\",{style:\"flex:1;min-width:0\"});\n      lbl.appendChild(el(\"span\",{style:\"font-weight:600\"+(already?\";opacity:.5\":\"\"),txt:c.label}));\n      if(already)lbl.appendChild(el(\"span\",{cls:\"badge\",style:\"margin-left:6px;font-size:10px\",txt:\"added\"}));\n      lbl.appendChild(el(\"div\",{cls:\"mono muted\",style:\"font-size:10px;margin-top:1px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap\",txt:c.name+(c.join?\" (\"+c.join+\")\":\"\")+(c.sourceName?\" \u2014 \"+c.sourceName:\"\")}));\n      var row=el(\"div\",{cls:\"cp-row\"+(already?\" cp-dim\":\"\")});\n      row.appendChild(el(\"div\",{style:\"width:22px;flex-shrink:0;display:flex;align-items:center\"},[chk]));\n      row.appendChild(lbl);row.appendChild(el(\"div\",{style:\"flex-shrink:0\"},[typeSel]));\n      if(!already){row.addEventListener(\"click\",function(e){if(e.target===chk||e.target===typeSel)return;chk.checked=!chk.checked;s.checked=chk.checked;updateCount();});}\n      listDiv.appendChild(row);\n    });\n  }\n  selAllBtn.addEventListener(\"click\",function(){allCols.forEach(function(c){if(!existingLabels[(c.label||\"\").toLowerCase().trim()])state[c.label].checked=true;});renderList(filterInp.value);updateCount();});\n  selNoneBtn.addEventListener(\"click\",function(){Object.keys(state).forEach(function(k){state[k].checked=false;});renderList(filterInp.value);updateCount();});\n  filterInp.addEventListener(\"input\",function(){renderList(filterInp.value);});\n  addSelBtn.addEventListener(\"click\",function(){var sel=allCols.filter(function(c){return state[c.label]&&state[c.label].checked;}).map(function(c){return{label:c.label,name:c.name,type:state[c.label].type};});closeModal();onConfirm(sel);});\n  var modal=el(\"div\",{cls:\"modal\"},[el(\"div\",{cls:\"modal-hd\"},[el(\"strong\",{txt:\"Pick Output Columns (\"+allCols.length+\" available)\"}),closeBtn]),el(\"div\",{cls:\"row\",style:\"flex-shrink:0;margin-bottom:8px;gap:8px;align-items:center\"},[filterInp]),el(\"div\",{cls:\"row\",style:\"flex-shrink:0;margin-bottom:8px;gap:8px;align-items:center\"},[selAllBtn,selNoneBtn,countSpan]),el(\"div\",{cls:\"cp-list-wrap\"},[listDiv]),el(\"div\",{cls:\"modal-footer\"},[addSelBtn])]);\n  openModal(modal);renderList(\"\");updateCount();\n}\n\n\n/* \u2550\u2550 AI Helper \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550 */\nasync function aiSuggest(task, prompt){\n  var d=await apiPost(\"ai.suggest\",{task:task,prompt:prompt});\n  return d.text||\"\";\n}\nfunction aiBtn(label,onclick){\n  var b=el(\"button\",{cls:\"ai-btn\",txt:\"\u2728 \"+label});\n  b.addEventListener(\"click\",onclick);\n  return b;\n}\n\n/* \u2550\u2550 Validation Modal \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550 */\nfunction showValModal(result){\n  var closeBtn=el(\"button\",{cls:\"icon-btn\",txt:\"\u2715\"});closeBtn.addEventListener(\"click\",closeModal);\n  var body=el(\"div\",{style:\"overflow:auto;max-height:60vh;padding:4px 0\"});\n  if(result.valid&&!(result.warnings&&result.warnings.length)){\n    body.appendChild(el(\"div\",{cls:\"val-ok\",txt:\"\u2713 No issues found. Report configuration looks good.\"}));\n  }\n  if(result.errors&&result.errors.length){\n    body.appendChild(el(\"div\",{cls:\"card-title\",style:\"color:var(--red);margin:12px 0 6px\",txt:\"Errors (\"+result.errors.length+\")\"}));\n    var errDiv=el(\"div\",{cls:\"val-panel\"});\n    result.errors.forEach(function(e){var row=el(\"div\",{cls:\"val-item val-err\"});row.appendChild(el(\"span\",{cls:\"val-icon\",style:\"color:var(--red)\",txt:\"\u2715\"}));row.appendChild(el(\"div\",{style:\"flex:1\"},[el(\"div\",{txt:e.msg}),el(\"span\",{cls:\"val-code\",txt:e.code})]));errDiv.appendChild(row);});\n    body.appendChild(errDiv);\n  }\n  if(result.warnings&&result.warnings.length){\n    body.appendChild(el(\"div\",{cls:\"card-title\",style:\"color:var(--yellow);margin:12px 0 6px\",txt:\"Warnings (\"+result.warnings.length+\")\"}));\n    var warnDiv=el(\"div\",{cls:\"val-panel\"});\n    result.warnings.forEach(function(w){var row=el(\"div\",{cls:\"val-item val-warn\"});row.appendChild(el(\"span\",{cls:\"val-icon\",style:\"color:var(--yellow)\",txt:\"\u26a0\"}));row.appendChild(el(\"div\",{style:\"flex:1\"},[el(\"div\",{txt:w.msg}),el(\"span\",{cls:\"val-code\",txt:w.code})]));warnDiv.appendChild(row);});\n    body.appendChild(warnDiv);\n  }\n  var doneBtn=el(\"button\",{cls:\"primary\",txt:\"Done\"});doneBtn.addEventListener(\"click\",closeModal);\n  openModal(el(\"div\",{cls:\"modal\"},[el(\"div\",{cls:\"modal-hd\"},[el(\"strong\",{txt:\"Validation Results\"}),closeBtn]),body,el(\"div\",{cls:\"modal-footer\"},[doneBtn])]));\n}\n\n/* \u2550\u2550 Reports View \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550 */\nasync function viewReports(){\n  setSidebarActive(\"/reports\");app.innerHTML=\"\";document.title=\"SearchFusion\";\n  var errDiv=el(\"div\",{cls:\"etxt\"}),listDiv=el(\"div\");\n  var nameInput=el(\"input\",{placeholder:\"e.g. Unified Exceptions Dashboard\"});\n  var createBtn=el(\"button\",{cls:\"primary\",txt:\"Create Report\"});\n  var refreshBtn=el(\"button\",{txt:\"\u27f3 Refresh\"});\n  app.appendChild(el(\"div\",{cls:\"ptitle\",txt:\"Reports\"}));\n  app.appendChild(el(\"div\",{cls:\"card\"},[el(\"div\",{cls:\"row\"},[el(\"div\",{cls:\"field\"},[el(\"label\",{txt:\"New Report Name\"}),nameInput]),createBtn,refreshBtn]),errDiv]));\n  var repFilterInp=el(\"input\",{cls:\"rep-filter\",placeholder:\"Search reports\u2026\"});\n  repFilterInp.addEventListener(\"input\",function(){var q=repFilterInp.value.toLowerCase();qsa(\"tbody tr\",listDiv).forEach(function(tr){tr.style.display=(!q||tr.querySelector(\"td\").textContent.toLowerCase().includes(q))?\"\":\"none\";});});\n  app.appendChild(el(\"div\",{cls:\"card\"},[el(\"div\",{cls:\"card-title\",txt:\"All Reports\"}),repFilterInp,listDiv]));\n  async function load(){\n    listDiv.innerHTML=\"\";listDiv.appendChild(el(\"div\",{cls:\"loading-row\"},[el(\"span\",{cls:\"spin\"}),\" Loading\u2026\"]));errDiv.textContent=\"\";\n    try{\n      var rows=await apiGet(\"reports.list\");listDiv.innerHTML=\"\";\n      if(!rows.length){listDiv.appendChild(el(\"div\",{cls:\"empty\",txt:\"No reports yet. Create one above.\"}));return;}\n      var tbody=el(\"tbody\");\n      rows.forEach(function(r){\n        var bBtn=el(\"button\",{cls:\"sm\",txt:\"Builder\"}),runBtn=el(\"button\",{cls:\"sm primary\",txt:\"\u25b6 Run\"}),dupBtn=el(\"button\",{cls:\"sm\",txt:\"Duplicate\"}),delBtn=el(\"button\",{cls:\"sm danger\",txt:\"Delete\"});\n        bBtn.addEventListener(\"click\",function(){navTo(\"/builder\",{rid:r.id});});\n        runBtn.addEventListener(\"click\",function(){navTo(\"/run\",{rid:r.id});});\n        dupBtn.addEventListener(\"click\",async function(){spin(dupBtn);try{var d=await apiPost(\"reports.duplicate\",{id:r.id});toast(\"s\",\"Duplicated\");navTo(\"/builder\",{rid:d.id});}catch(e){toast(\"e\",e.message);unspin(dupBtn);}});\n        delBtn.addEventListener(\"click\",function(){openConfirm(\"Delete \\\"\"+r.name+\"\\\"? This cannot be undone.\",async function(){spin(delBtn);try{await apiPost(\"reports.delete\",{id:r.id});toast(\"s\",\"Deleted\");await load();}catch(e){toast(\"e\",e.message);unspin(delBtn);}},{title:\"Delete Report\",ok:\"Delete\"});});\n        tbody.appendChild(el(\"tr\",{},[el(\"td\",{style:\"font-weight:600\",txt:r.name}),el(\"td\",{cls:\"mono muted\",txt:r.id}),el(\"td\",{},[el(\"div\",{cls:\"row\",style:\"flex-wrap:nowrap;gap:6px\"},[bBtn,runBtn,dupBtn,delBtn])])]));\n      });\n      listDiv.appendChild(el(\"div\",{cls:\"tw\"},[el(\"table\",{},[el(\"thead\",{},[el(\"tr\",{},[el(\"th\",{txt:\"Name\"}),el(\"th\",{txt:\"ID\"}),el(\"th\",{txt:\"Actions\"})])]),tbody])]));\n    }catch(e){errDiv.textContent=e.message;listDiv.innerHTML=\"\";}\n  }\n  refreshBtn.addEventListener(\"click\",load);\n  createBtn.addEventListener(\"click\",async function(){var name=nameInput.value.trim();if(!name){errDiv.textContent=\"Enter a report name\";return;}spin(createBtn);try{var d=await apiPost(\"reports.create\",{name:name});nameInput.value=\"\";toast(\"s\",\"Created: \"+name);navTo(\"/builder\",{rid:d.id});}catch(e){errDiv.textContent=e.message;unspin(createBtn);}});\n  nameInput.addEventListener(\"keydown\",function(e){if(e.key===\"Enter\")createBtn.click();});\n  await load();\n}\n\n/* \u2550\u2550 Builder View \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550 */\nasync function viewBuilder(rid){\n  setSidebarActive(\"/reports\");app.innerHTML=\"\";\n  var udot=el(\"span\",{cls:\"udot\"});\n  var saveBtn=el(\"button\",{cls:\"primary\"});saveBtn.appendChild(udot);saveBtn.appendChild(document.createTextNode(\" Save Settings\"));\n  var goRunBtn=el(\"button\",{txt:\"\u25b6 Run\"}),valBtn=el(\"button\",{txt:\"\u2713 Validate\"}),pillSpan=el(\"span\",{cls:\"pill pill-d\"}),gerrDiv=el(\"div\",{cls:\"etxt\",style:\"margin-bottom:10px\"});\n  valBtn.addEventListener(\"click\",async function(){spin(valBtn);try{var d=await apiGet(\"reports.validate\",{reportId:rid});showValModal(d);}catch(e){toast(\"e\",\"Validation failed: \"+e.message);}unspin(valBtn);});\n  var settingsWrap=el(\"div\"),sourcesWrap=el(\"div\"),columnsWrap=el(\"div\"),mappingsWrap=el(\"div\"),flagsWrap=el(\"div\"),pivotsWrap=el(\"div\"),scheduleWrap=el(\"div\");\n  var titleRow=el(\"div\",{cls:\"ptitle\",style:\"display:flex;align-items:center;gap:12px\"});\n  titleRow.appendChild(document.createTextNode(\"Report Builder \"));titleRow.appendChild(pillSpan);\n  titleRow.appendChild(el(\"div\",{style:\"margin-left:auto;display:flex;gap:8px\"},[valBtn,goRunBtn,saveBtn]));\n  app.appendChild(titleRow);app.appendChild(gerrDiv);\n  app.appendChild(settingsWrap);app.appendChild(sourcesWrap);app.appendChild(columnsWrap);app.appendChild(mappingsWrap);app.appendChild(flagsWrap);app.appendChild(pivotsWrap);app.appendChild(scheduleWrap);\n  var report=null,mapEdits={},mapInited=false;\n  function markDirty(){udot.style.display=\"inline-block\";}\n  function clearDirty(){udot.style.display=\"none\";}\n  function gerr(msg){gerrDiv.textContent=msg||\"\";}\n\n  /* Settings */\n  function renderSettings(){\n    settingsWrap.innerHTML=\"\";\n    var nameInp=el(\"input\",{value:report.name||\"\"});\n    var outSel=el(\"select\");[\"CSV\",\"EXCEL\",\"PDF\"].forEach(function(v){outSel.appendChild(el(\"option\",{value:v,txt:v}));});outSel.value=report.defaultOutput||\"CSV\";\n    var capInp=el(\"input\",{type:\"number\",value:String(report.previewCap||1000),style:\"max-width:120px\"});\n    var aiSel=el(\"select\",{style:\"max-width:100px\"});[{v:\"false\",t:\"No\"},{v:\"true\",t:\"Yes\"}].forEach(function(x){aiSel.appendChild(el(\"option\",{value:x.v,txt:x.t}));});aiSel.value=report.aiEnabled?\"true\":\"false\";\n    var sortInp=el(\"input\",{value:report.sortKeys||\"\",placeholder:\"customer,date\",list:\"sf-sort-dl\"});(function(){var oe=document.getElementById(\"sf-sort-dl\");if(oe)oe.remove();var dl=document.createElement(\"datalist\");dl.id=\"sf-sort-dl\";report.columns.forEach(function(c){var o=document.createElement(\"option\");o.value=c.key;o.label=c.label||\"\";dl.appendChild(o);});document.body.appendChild(dl);}());\n    var dedupInp=el(\"input\",{value:report.dedupeKey||\"\",placeholder:\"invoice_no|customer\",list:\"sf-dedup-dl\"});(function(){var oe=document.getElementById(\"sf-dedup-dl\");if(oe)oe.remove();var dl=document.createElement(\"datalist\");dl.id=\"sf-dedup-dl\";report.columns.forEach(function(c){var o=document.createElement(\"option\");o.value=c.key;o.label=c.label||\"\";dl.appendChild(o);});document.body.appendChild(dl);}());\n    var modeWrap=el(\"div\",{cls:\"merge-toggle\"});\n    [{v:\"APPEND\",t:\"\u2295 Append\",desc:\"Stack all source rows vertically (union)\"},{v:\"JOIN\",t:\"\u21c4 Join\",desc:\"Merge sources horizontally on a shared key\"},{v:\"SMART\",t:\"\u26a1 Smart\",desc:\"Auto-join: set one common column key \u2014 rows from all sources that share that key value are merged into one row\"}].forEach(function(m){\n      var btn=el(\"button\",{cls:\"merge-opt\"+(report.mergeMode===m.v?\" active\":\"\"),txt:m.t});btn.title=m.desc;\n      btn.addEventListener(\"click\",function(){report.mergeMode=m.v;qsa(\".merge-opt\").forEach(function(b){b.classList.remove(\"active\");});btn.classList.add(\"active\");modeHint.textContent=report.mergeMode===\"JOIN\"?\"JOIN: sources merge horizontally on a shared key. Configure join keys per source below.\": report.mergeMode===\"SMART\"?\"SMART: set the Merge Key to the output column key shared across sources (e.g. customer_id). Rows with the same key value are merged automatically.\":\"APPEND: all source rows stacked vertically. No join key needed.\";var mkr=document.getElementById(\"sf-mkey-row\");if(mkr)mkr.style.display=report.mergeMode===\"SMART\"?\"flex\":\"none\";renderSources();markDirty();});\n      modeWrap.appendChild(btn);\n    });\n    var sepInp=el(\"input\",{value:report.joinSeparator||\"; \",placeholder:\"; \",style:\"max-width:80px\"});    var mkeyInp=el(\"input\",{value:report.mergeKey||\"\",placeholder:\"e.g. customer_id\",style:\"max-width:220px\",list:\"sf-mkey-dl\"});(function(){var oe=document.getElementById(\"sf-mkey-dl\");if(oe)oe.remove();var dl=document.createElement(\"datalist\");dl.id=\"sf-mkey-dl\";report.columns.forEach(function(c){var o=document.createElement(\"option\");o.value=c.key;o.label=c.label||\"\";dl.appendChild(o);});document.body.appendChild(dl);}());\n    var modeHint=el(\"div\",{cls:\"hint-text\",txt:report.mergeMode===\"JOIN\"?\"JOIN: sources merge horizontally on a shared key. Configure join keys per source below.\":\"APPEND: all source rows stacked vertically. No join key needed.\"});\n    [nameInp,outSel,capInp,aiSel,sortInp,dedupInp,sepInp,mkeyInp].forEach(function(e){e.addEventListener(\"input\",markDirty);e.addEventListener(\"change\",markDirty);});\n    settingsWrap.appendChild(el(\"div\",{cls:\"card\"},[\n      el(\"div\",{cls:\"card-title\",txt:\"Settings\"}),\n      el(\"div\",{cls:\"settings-merge-row\"},[el(\"label\",{cls:\"settings-label\",txt:\"Merge Mode\"}),modeWrap,el(\"div\",{cls:\"row\",style:\"align-items:center;gap:6px;margin-left:16px\"},[el(\"span\",{cls:\"muted\",style:\"font-size:11px\",txt:\"Multi-match separator:\"}),sepInp])]),\n      el(\"div\",{cls:\"hint-wrap\"},[modeHint]),      el(\"div\",{cls:\"settings-merge-row\",style:\"margin-top:8px;display:none\",id:\"sf-mkey-row\"},[el(\"span\",{cls:\"settings-label\",txt:\"Merge Key (output column key)\"}),mkeyInp,el(\"span\",{cls:\"hint-text\",style:\"margin-left:8px\",txt:\"The output column key shared across sources (e.g. customer_id). Rows with the same value are merged.\"})])  ,\n      el(\"div\",{cls:\"row\",style:\"margin-top:14px\"},[el(\"div\",{cls:\"field\"},[el(\"label\",{txt:\"Report Name\"}),nameInp]),el(\"div\",{cls:\"field\",style:\"max-width:160px\"},[el(\"label\",{txt:\"Default Output\"}),outSel]),el(\"div\",{cls:\"field\",style:\"max-width:140px\"},[el(\"label\",{txt:\"Preview Cap\"}),capInp]),el(\"div\",{cls:\"field\",style:\"max-width:120px\"},[el(\"label\",{txt:\"AI Enabled\"}),aiSel])]),\n      el(\"div\",{cls:\"row\",style:\"margin-top:12px\"},[el(\"div\",{cls:\"field\"},[el(\"label\",{txt:\"Sort Keys (comma)\"}),sortInp]),el(\"div\",{cls:\"field\"},[el(\"label\",{txt:\"Dedupe Key (pipe-separated)\"}),dedupInp])])\n    ]));\n    /* Show mkey row if SMART mode was already set */    (function(){var mkr=document.getElementById(\"sf-mkey-row\");if(mkr)mkr.style.display=report.mergeMode===\"SMART\"?\"flex\":\"none\";})();    /* AI key status banner */\n    if(report.aiEnabled){\n      settingsWrap.querySelector(\".card\").appendChild(el(\"div\",{cls:\"ai-key-banner\"},[\n        el(\"span\",{txt:\"\u2728 AI features enabled. \"}),\n        el(\"span\",{cls:\"muted\",txt:\"Set custscript_sf_azure_key on the Suitelet deployment with your Azure OpenAI API key. Endpoint and deployment default to the configured Azure instance (hackathon-model-grp-02).\"})\n      ]));\n    }\n    saveBtn.onclick=async function(){spin(saveBtn);try{await apiPost(\"reports.update\",{id:report.id,name:nameInp.value.trim(),defaultOutput:outSel.value,previewCap:parseInt(capInp.value||\"1000\",10),sortKeys:sortInp.value.trim(),dedupeKey:dedupInp.value.trim(),aiEnabled:aiSel.value===\"true\",mergeMode:report.mergeMode,mergeKey:mkeyInp.value.trim(),joinSeparator:sepInp.value});toast(\"s\",\"Settings saved\");clearDirty();}catch(e){toast(\"e\",e.message);}unspin(saveBtn);};\n  }\n\n  /* Sources */\n  function srcJoinBadge(src){var m={PRIMARY:[\"badge-primary\",\"PRIMARY\"],LEFT:[\"badge-left\",\"LEFT JOIN\"],INNER:[\"badge-inner\",\"INNER JOIN\"],APPEND:[\"badge-append\",\"APPEND\"]};var v=m[src.joinType]||[\"badge\",\"?\"];return el(\"span\",{cls:\"badge \"+v[0],txt:v[1]});}\n  function renderSources(){\n    sourcesWrap.innerHTML=\"\";\n    var nssid=el(\"input\",{cls:\"mono\",placeholder:\"customsearch_xxx\"}),nsname=el(\"input\",{placeholder:\"Source name\"});\n    var nsmode=el(\"select\");[\"LABEL\",\"INTERNAL_ID\"].forEach(function(v){nsmode.appendChild(el(\"option\",{value:v,txt:v}));});\n    var addBtn=el(\"button\",{cls:\"primary\",txt:\"Add Source\"}),browseBtn=el(\"button\",{txt:\"\ud83d\udd0d Browse\"});\n    var srcList=el(\"div\");\n    browseBtn.addEventListener(\"click\",function(){showSearchBrowser({title:\"Browse & Add Source\",onSelect:async function(ssid,name){spin(addBtn);try{await apiPost(\"sources.create\",{reportId:report.id,savedSearchId:ssid,name:name,enabled:true,category:\"\",mappingMode:\"LABEL\",joinType:report.sources.length===0?\"PRIMARY\":\"LEFT\",joinPriority:report.sources.length+1,multiMatch:\"FIRST\"});toast(\"s\",\"Added: \"+name);await reload();}catch(e){toast(\"e\",e.message);unspin(addBtn);}}});});\n    addBtn.addEventListener(\"click\",async function(){var ssid=nssid.value.trim();if(!ssid){toast(\"e\",\"Saved Search ID required\");return;}spin(addBtn);try{await apiPost(\"sources.create\",{reportId:report.id,savedSearchId:ssid,name:nsname.value.trim()||ssid,enabled:true,category:\"\",mappingMode:nsmode.value,joinType:report.sources.length===0?\"PRIMARY\":\"LEFT\",joinPriority:report.sources.length+1,multiMatch:\"FIRST\"});nssid.value=\"\";nsname.value=\"\";toast(\"s\",\"Source added\");await reload();}catch(e){toast(\"e\",e.message);unspin(addBtn);}});\n    sourcesWrap.appendChild(el(\"div\",{cls:\"card\"},[el(\"div\",{cls:\"card-title\",txt:\"Sources\"}),el(\"div\",{cls:\"row\",style:\"margin-bottom:14px\"},[el(\"div\",{cls:\"field\",style:\"max-width:230px\"},[el(\"label\",{txt:\"Saved Search ID\"}),nssid]),el(\"div\",{cls:\"field\",style:\"max-width:200px\"},[el(\"label\",{txt:\"Name\"}),nsname]),el(\"div\",{cls:\"field\",style:\"max-width:140px\"},[el(\"label\",{txt:\"Mode\"}),nsmode]),el(\"div\",{style:\"display:flex;gap:8px;align-items:flex-end\"},[addBtn,browseBtn])]),srcList]));\n    renderSrcList(srcList);\n  }\n\n  function renderSrcList(container){\n    container.innerHTML=\"\";\n    if(!report.sources.length){container.appendChild(el(\"div\",{cls:\"empty\",txt:\"No sources yet. Add one above or click Browse.\"}));return;}\n    var isJoin=report.mergeMode===\"JOIN\";\n    report.sources.forEach(function(src){\n      var card=el(\"div\",{cls:\"src-card\"+(src.joinType===\"PRIMARY\"?\" src-card-primary\":\"\")});\n      var hdrBadges=el(\"div\",{cls:\"src-card-badges\"});\n      if(isJoin)hdrBadges.appendChild(srcJoinBadge(src));\n      if(!src.enabled)hdrBadges.appendChild(el(\"span\",{cls:\"badge\",txt:\"disabled\"}));\n      card.appendChild(el(\"div\",{cls:\"src-card-hdr\"},[el(\"div\",{},[el(\"span\",{style:\"font-weight:700\",txt:src.name}),hdrBadges]),el(\"div\",{cls:\"mono muted\",style:\"font-size:11px;margin-top:2px\",txt:src.savedSearchId})]));\n\n      var ssidInp=el(\"input\",{cls:\"mono\",value:src.savedSearchId});\n      var nameInp=el(\"input\",{value:src.name});\n      var enSel=el(\"select\",{style:\"max-width:110px\"});[{v:\"true\",t:\"Enabled\"},{v:\"false\",t:\"Disabled\"}].forEach(function(x){enSel.appendChild(el(\"option\",{value:x.v,txt:x.t}));});enSel.value=src.enabled?\"true\":\"false\";\n      var modeSel=el(\"select\",{style:\"max-width:140px\"});[\"LABEL\",\"INTERNAL_ID\"].forEach(function(v){modeSel.appendChild(el(\"option\",{value:v,txt:v}));});modeSel.value=src.mappingMode||\"LABEL\";\n\n      var fieldsRow=el(\"div\",{cls:\"row\",style:\"margin-top:10px;flex-wrap:wrap\"});\n      fieldsRow.appendChild(el(\"div\",{cls:\"field\"},[el(\"label\",{txt:\"Saved Search ID\"}),ssidInp]));\n      fieldsRow.appendChild(el(\"div\",{cls:\"field\",style:\"max-width:200px\"},[el(\"label\",{txt:\"Name\"}),nameInp]));\n      fieldsRow.appendChild(el(\"div\",{cls:\"field\",style:\"max-width:130px\"},[el(\"label\",{txt:\"Status\"}),enSel]));\n      fieldsRow.appendChild(el(\"div\",{cls:\"field\",style:\"max-width:150px\"},[el(\"label\",{txt:\"Mapping Mode\"}),modeSel]));\n      card.appendChild(fieldsRow);\n\n      /* Join-specific fields */\n      var joinTypeSel=null,joinKeyInp=null,joinOnInp=null,matchSel=null,priInp=null;\n      if(isJoin){\n        joinTypeSel=el(\"select\",{style:\"max-width:150px\"});\n        [{v:\"PRIMARY\",t:\"Primary (anchor)\"},{v:\"LEFT\",t:\"Left Join\"},{v:\"INNER\",t:\"Inner Join\"},{v:\"APPEND\",t:\"Append only\"}].forEach(function(x){joinTypeSel.appendChild(el(\"option\",{value:x.v,txt:x.t}));});\n        joinTypeSel.value=src.joinType||\"LEFT\";\n        joinKeyInp=el(\"input\",{value:src.joinKey||\"\",placeholder:\"key field in this source\"});\n        joinOnInp=el(\"input\",{value:src.joinOnPrimary||\"\",placeholder:\"matching key in primary\"});\n        matchSel=el(\"select\",{style:\"max-width:140px\"});\n        [{v:\"FIRST\",t:\"First match\"},{v:\"LAST\",t:\"Last match\"},{v:\"CONCAT\",t:\"Concatenate\"},{v:\"SUM\",t:\"Sum values\"},{v:\"EXPAND\",t:\"Expand to rows\"}].forEach(function(x){matchSel.appendChild(el(\"option\",{value:x.v,txt:x.t}));});\n        matchSel.value=src.multiMatch||\"FIRST\";\n        priInp=el(\"input\",{type:\"number\",value:String(src.joinPriority||99),style:\"max-width:70px\"});\n\n        // update badge live when type changes\n        joinTypeSel.addEventListener(\"change\",function(){\n          src.joinType=joinTypeSel.value;\n          card.className=\"src-card\"+(src.joinType===\"PRIMARY\"?\" src-card-primary\":\"\");\n          hdrBadges.innerHTML=\"\";hdrBadges.appendChild(srcJoinBadge(src));\n        });\n\n        var joinRow=el(\"div\",{cls:\"join-row\"});\n        joinRow.appendChild(el(\"div\",{cls:\"field\",style:\"max-width:180px\"},[el(\"label\",{txt:\"Join Type\"}),joinTypeSel]));\n        joinRow.appendChild(el(\"div\",{cls:\"field\"},[el(\"label\",{txt:\"Join Key (this source)\"}),joinKeyInp]));\n        joinRow.appendChild(el(\"div\",{cls:\"field\"},[el(\"label\",{txt:\"Matches Primary Key\"}),joinOnInp]));\n        joinRow.appendChild(el(\"div\",{cls:\"field\",style:\"max-width:160px\"},[el(\"label\",{txt:\"Multi-match Strategy\"}),matchSel]));\n        joinRow.appendChild(el(\"div\",{cls:\"field\",style:\"max-width:80px\"},[el(\"label\",{txt:\"Order\"}),priInp]));\n        card.appendChild(joinRow);\n      }\n\n      var saveBtn2=el(\"button\",{cls:\"sm primary\",txt:\"Save\"}),inspBtn=el(\"button\",{cls:\"sm\",txt:\"\ud83d\udd0d Inspect\"}),delBtn=el(\"button\",{cls:\"sm danger\",txt:\"Delete\"});\n      saveBtn2.addEventListener(\"click\",async function(){spin(saveBtn2);try{await apiPost(\"sources.update\",{id:src.id,reportId:report.id,savedSearchId:ssidInp.value.trim(),name:nameInp.value.trim(),enabled:enSel.value===\"true\",category:\"\",mappingMode:modeSel.value,joinType:isJoin?joinTypeSel.value:\"APPEND\",joinKey:isJoin?joinKeyInp.value.trim():\"\",joinOnPrimary:isJoin?joinOnInp.value.trim():\"\",joinPriority:isJoin?parseInt(priInp.value||\"99\",10):99,multiMatch:isJoin?matchSel.value:\"FIRST\"});toast(\"s\",\"Source saved\");await reload();}catch(e){toast(\"e\",e.message);unspin(saveBtn2);}});\n      inspBtn.addEventListener(\"click\",function(){showSearchBrowser({title:\"Inspect: \"+src.name});});\n      delBtn.addEventListener(\"click\",function(){openConfirm(\"Delete source \\\"\"+src.name+\"\\\"? Mappings will also be removed.\",async function(){spin(delBtn);try{await apiPost(\"sources.delete\",{id:src.id});toast(\"s\",\"Deleted\");await reload();}catch(e){toast(\"e\",e.message);unspin(delBtn);}},{title:\"Delete Source\",ok:\"Delete\"});});\n      card.appendChild(el(\"div\",{cls:\"src-actions\"},[saveBtn2,inspBtn,delBtn]));\n      container.appendChild(card);\n    });\n    if(report.mergeMode===\"JOIN\")container.appendChild(el(\"div\",{cls:\"hint-text\",style:\"margin-top:10px\"},[\"\ud83d\udca1 Primary = anchor rows. Left Join = keep all primary rows (blank where no match). Inner Join = only rows that match in both. CONCAT/SUM multi-match: combine multiple enrichment matches into one cell.\"]));\n  }\n\n  /* Columns */\n  function renderColumns(){\n    columnsWrap.innerHTML=\"\";\n    var colTableDiv=el(\"div\");\n    var pickBtn=el(\"button\",{txt:\"\ud83d\udd0d Pick Columns from Sources\"});\n    pickBtn.addEventListener(\"click\",async function(){\n      if(!report.sources.length){toast(\"e\",\"Add at least one source first\");return;}\n      spin(pickBtn);\n      var seen={},allCols=[];\n      try{\n        for(var si=0;si<report.sources.length;si++){\n          var src=report.sources[si];\n          try{var cols=await apiGet(\"sources.describe\",{savedSearchId:src.savedSearchId});cols.forEach(function(c){var key=(c.label||c.name).toLowerCase().trim();if(!seen[key]){seen[key]=true;allCols.push(Object.assign({},c,{sourceName:src.name}));}});}\n          catch(e2){toast(\"e\",\"Could not load \"+src.name+\": \"+e2.message);}\n        }\n        unspin(pickBtn); /* FIX: unspin BEFORE showing picker so button is usable if picker dismissed */\n        if(!allCols.length){toast(\"e\",\"No columns found in any source\");return;}\n        var existingLabels={};report.columns.forEach(function(c){existingLabels[(c.label||c.key).toLowerCase().trim()]=true;});\n        showColumnPicker(allCols,existingLabels,async function(selected){\n          if(!selected.length)return;\n          spin(pickBtn);\n          try{\n            for(var i=0;i<selected.length;i++){var s=selected[i];await apiPost(\"columns.create\",{reportId:report.id,key:slugify(s.label),label:s.label,type:s.type||\"TEXT\",required:false,defaultValue:\"\",transform:\"\",formula:\"\"});}\n            toast(\"s\",selected.length+\" column(s) added\");await reload(true);\n          }catch(e3){toast(\"e\",e3.message);}\n          unspin(pickBtn);\n        });\n      }catch(e){toast(\"e\",e.message);unspin(pickBtn);}\n    });\n\n    var nckey=el(\"input\",{cls:\"mono\",placeholder:\"auto-filled from label\"});\n    var nclbl=el(\"input\",{placeholder:\"Column Label\"});\n    var nctype=el(\"select\");[\"TEXT\",\"NUMBER\",\"CURRENCY\",\"DATE\",\"COMPUTED\"].forEach(function(v){nctype.appendChild(el(\"option\",{value:v,txt:v}));});\n    var ncformula=el(\"input\",{placeholder:\"{amount} - {tax}  or  IF({status}=='Closed','Done','Open')\",style:\"display:none\"});\n    nctype.addEventListener(\"change\",function(){ncformula.style.display=nctype.value===\"COMPUTED\"?\"block\":\"none\";});\n    var nctr=el(\"input\",{placeholder:\"toNumber / trim\"});\n    var addColBtn=el(\"button\",{cls:\"primary\",txt:\"Add Column\"});\n    var ncformulaAiBtn=aiBtn(\"Generate\",async function(){\n      var desc=prompt(\"Describe what to compute:\",\"\");if(!desc)return;\n      spin(ncformulaAiBtn);\n      try{\n        var colKeys=report.columns.filter(function(c){return c.type!==\"COMPUTED\";}).map(function(c){return c.key+\"(\"+c.label+\")\";});\n        var txt=await aiSuggest(\"formula\",\"Available columns: \"+colKeys.join(\", \")+\". Task: \"+desc+\" Return only the formula expression.\");\n        ncformula.value=txt.trim().replace(/^[\"\\'`]+|[\"\\'`]+$/g,\"\");\n        toast(\"s\",\"Formula generated\");\n      }catch(e){toast(\"e\",\"AI error: \"+e.message);}\n      unspin(ncformulaAiBtn);\n    });\n    nclbl.addEventListener(\"input\",function(){if(!nckey.dataset.me)nckey.value=slugify(nclbl.value);}); /* auto-fill key */\n    nckey.addEventListener(\"input\",function(){nckey.dataset.me=nckey.value?\"1\":\"\";}); /* mark as manually edited */\n    addColBtn.addEventListener(\"click\",async function(){var key=nckey.value.trim()||slugify(nclbl.value.trim());if(!key){toast(\"e\",\"Column label/key required\");return;}spin(addColBtn);try{await apiPost(\"columns.create\",{reportId:report.id,key:key,label:nclbl.value.trim()||key,type:nctype.value,required:false,defaultValue:\"\",transform:nctr.value.trim(),formula:ncformula.value.trim()});nclbl.value=\"\";nckey.value=\"\";ncformula.value=\"\";delete nckey.dataset.me;toast(\"s\",\"Column added\");await reload(true);}catch(e){toast(\"e\",e.message);unspin(addColBtn);}});\n\n    columnsWrap.appendChild(el(\"div\",{cls:\"card\"},[\n      el(\"div\",{cls:\"card-title\",txt:\"Output Columns\"}),\n      el(\"div\",{cls:\"row\",style:\"margin-bottom:14px;align-items:center;gap:10px\"},[pickBtn,el(\"span\",{cls:\"muted\",style:\"font-size:11px\",txt:\"or add manually:\"})]),\n      el(\"div\",{cls:\"row\",style:\"margin-bottom:6px;flex-wrap:wrap\"},[el(\"div\",{cls:\"field\"},[el(\"label\",{txt:\"Label (key auto-fills)\"}),nclbl]),el(\"div\",{cls:\"field\",style:\"max-width:180px\"},[el(\"label\",{txt:\"Key (editable)\"}),nckey]),el(\"div\",{cls:\"field\",style:\"max-width:130px\"},[el(\"label\",{txt:\"Type\"}),nctype]),el(\"div\",{cls:\"field\",style:\"max-width:140px\"},[el(\"label\",{txt:\"Transform\"}),nctr]),addColBtn]),\n      el(\"div\",{cls:\"row\",style:\"margin-bottom:10px;align-items:center;gap:8px\"},[el(\"div\",{style:\"flex:1\"},[ncformula]),ncformulaAiBtn]),\n      colTableDiv\n    ]));\n    renderColTable(colTableDiv);\n  }\n\n  function renderColTable(container){\n    container.innerHTML=\"\";\n    if(!report.columns.length){container.appendChild(el(\"div\",{cls:\"empty\",txt:\"No columns yet. Use \\\"Pick Columns from Sources\\\" or add manually above.\"}));return;}\n    var tbody=el(\"tbody\");\n    report.columns.forEach(function(col){\n      var keyInp=el(\"input\",{cls:\"mono\",value:col.key});\n      var lblInp=el(\"input\",{value:col.label});if(col.key===slugify(col.label))keyInp.dataset.lsync=\"1\";keyInp.addEventListener(\"input\",function(){delete keyInp.dataset.lsync;});lblInp.addEventListener(\"input\",function(){if(keyInp.dataset.lsync)keyInp.value=slugify(lblInp.value.trim());});\n      var typeSel=el(\"select\",{style:\"max-width:110px\"});[\"TEXT\",\"NUMBER\",\"CURRENCY\",\"DATE\",\"COMPUTED\"].forEach(function(v){typeSel.appendChild(el(\"option\",{value:v,txt:v}));});typeSel.value=col.type||\"TEXT\";\n      var reqSel=el(\"select\",{style:\"max-width:70px\"});[{v:\"false\",t:\"No\"},{v:\"true\",t:\"Yes\"}].forEach(function(x){reqSel.appendChild(el(\"option\",{value:x.v,txt:x.t}));});reqSel.value=col.required?\"true\":\"false\";\n      var trInp=el(\"input\",{value:col.transform||\"\",placeholder:\"toNumber\"});\n      var formulaWrap=el(\"div\",{style:\"margin-top:4px;display:\"+(col.type===\"COMPUTED\"?\"block\":\"none\")});\n      var formulaInp=el(\"input\",{value:col.formula||\"\",placeholder:\"{a} - {b}  or  IF({x},'y','z')\"});\n      var formulaAiBtn=aiBtn(\"Generate\",async function(){\n        var desc=prompt(\"Describe what to compute (e.g. \\\"subtract tax from amount\\\"):\",\"\");\n        if(!desc)return;\n        spin(formulaAiBtn);\n        try{\n          var colKeys=report.columns.filter(function(c){return c.type!==\"COMPUTED\";}).map(function(c){return c.key+\"(\"+c.label+\")\";});\n          var txt=await aiSuggest(\"formula\",\"Available columns: \"+colKeys.join(\", \")+\". Task: \"+desc+\" Return only the formula expression.\");\n          formulaInp.value=txt.trim().replace(/^[\"\\'`]+|[\"\\'`]+$/g,\"\");\n          toast(\"s\",\"Formula generated\");\n        }catch(e){toast(\"e\",\"AI error: \"+e.message);}\n        unspin(formulaAiBtn);\n      });\n      formulaWrap.appendChild(el(\"div\",{cls:\"row\",style:\"align-items:center;gap:8px;margin-bottom:3px\"},[el(\"span\",{cls:\"hint-text\",txt:\"Formula:\"}),formulaAiBtn]));\n      formulaWrap.appendChild(formulaInp);\n      typeSel.addEventListener(\"change\",function(){formulaWrap.style.display=typeSel.value===\"COMPUTED\"?\"block\":\"none\";});\n      var saveBtn3=el(\"button\",{cls:\"sm primary\",txt:\"Save\"}),delBtn=el(\"button\",{cls:\"sm danger\",txt:\"Delete\"});\n      var ci=report.columns.indexOf(col);var upBtn=el(\"button\",{cls:\"sm icon-btn\",txt:\"\u2191\",title:\"Move up\"});var dnBtn=el(\"button\",{cls:\"sm icon-btn\",txt:\"\u2193\",title:\"Move down\"});upBtn.disabled=ci===0;dnBtn.disabled=ci===report.columns.length-1;\n      function doReorder(ai,bi){var ca=report.columns[ai],cb=report.columns[bi],t=ca.order;ca.order=cb.order!==t?cb.order:bi;cb.order=cb.order!==t?t:ai;if(ca.order===cb.order){ca.order=ai;cb.order=bi;}return Promise.all([ca,cb].map(function(c){return apiPost(\"columns.update\",{id:c.id,key:c.key,label:c.label,type:c.type,formula:c.formula||'',format:c.format||'',defaultValue:c.defaultValue||'',required:c.required,visible:c.visible!==false,sortable:!!c.sortable,order:c.order,summary:c.summary||'NONE'});})).then(function(){return reload(true);});}\n      upBtn.addEventListener(\"click\",function(){spin(upBtn);doReorder(ci,ci-1).catch(function(e){toast(\"e\",e.message);unspin(upBtn);});});\n      dnBtn.addEventListener(\"click\",function(){spin(dnBtn);doReorder(ci,ci+1).catch(function(e){toast(\"e\",e.message);unspin(dnBtn);});});\n      saveBtn3.addEventListener(\"click\",async function(){spin(saveBtn3);try{await apiPost(\"columns.update\",{id:col.id,key:keyInp.value.trim(),label:lblInp.value.trim(),type:typeSel.value,required:reqSel.value===\"true\",defaultValue:\"\",transform:trInp.value.trim(),formula:formulaInp.value.trim()});toast(\"s\",\"Saved\");await reload(true);}catch(e){toast(\"e\",e.message);unspin(saveBtn3);}});\n      delBtn.addEventListener(\"click\",function(){openConfirm(\"Delete column \\\"\"+col.key+\"\\\"?\",async function(){spin(delBtn);try{await apiPost(\"columns.delete\",{id:col.id});toast(\"s\",\"Deleted\");await reload(true);}catch(e){toast(\"e\",e.message);unspin(delBtn);}},{title:\"Delete Column\",ok:\"Delete\"});});\n      var td3=el(\"td\");td3.appendChild(typeSel);td3.appendChild(formulaWrap);\n      tbody.appendChild(el(\"tr\",{},[el(\"td\",{},[keyInp]),el(\"td\",{},[lblInp]),td3,el(\"td\",{},[reqSel]),el(\"td\",{},[trInp]),el(\"td\",{},[el(\"div\",{cls:\"row\",style:\"flex-wrap:nowrap;gap:4px\"},[el(\"div\",{cls:\"ord-wrap\"},[upBtn,dnBtn]),saveBtn3,delBtn])])]));\n    });\n    container.appendChild(el(\"div\",{cls:\"tw\"},[el(\"table\",{},[el(\"thead\",{},[el(\"tr\",{},[el(\"th\",{txt:\"Key\"}),el(\"th\",{txt:\"Label\"}),el(\"th\",{txt:\"Type / Formula\"}),el(\"th\",{txt:\"Required\"}),el(\"th\",{txt:\"Transform\"}),el(\"th\",{txt:\"Actions\"})])]),tbody])]));\n  }\n\n  /* Mappings */\n  function renderMappings(){\n    mappingsWrap.innerHTML=\"\";\n    if(!mapInited){mapEdits={};(report.mappings||[]).forEach(function(m){mapEdits[m.sourceId+\"::\"+m.outputKey]=m.label||\"\";});mapInited=true;}\n    var saveMapBtn=el(\"button\",{cls:\"primary\",txt:\"Save Mappings\"}),gridDiv=el(\"div\");\n    var semMapBtn=aiBtn(\"\u26a1 Semantic Map\",async function(){\n      spin(semMapBtn);\n      try{\n        var srcDescs2=[];\n        for(var si2=0;si2<report.sources.length;si2++){\n          var src2=report.sources[si2];\n          try{var cols2=await apiGet(\"sources.describe\",{savedSearchId:src2.savedSearchId});srcDescs2.push({id:src2.id,name:src2.name,columns:cols2.map(function(c){return c.label;})});}\n          catch(e3){toast(\"e\",\"Skip \"+src2.name+\": \"+e3.message);}\n        }\n        var nonComp2=report.columns.filter(function(c){return c.type!==\"COMPUTED\";});\n        if(!nonComp2.length||!srcDescs2.length){toast(\"e\",\"Add sources and columns first\");unspin(semMapBtn);return;}\n        var sug=await apiPost(\"ai.semmap\",{outputCols:nonComp2.map(function(c){return{key:c.key,label:c.label};}),sources:srcDescs2,threshold:0.70});\n        var n2=0;Object.keys(sug).forEach(function(k){if(!mapEdits[k]){mapEdits[k]=sug[k];n2++;}});\n        renderMapGrid(gridDiv);toast(\"s\",\"\u26a1 Semantic match: \"+n2+\" mapping\"+(n2!==1?\"s\":\"\"));\n      }catch(e4){toast(\"e\",\"Semantic mapping failed: \"+e4.message);}\n      unspin(semMapBtn);\n    });semMapBtn.title=\"Embeds column labels via Azure text-embedding-3-small and finds best matches by cosine similarity (threshold \u2265 0.70)\";\n    var aiMapBtn=aiBtn(\"\u2728 AI Map All\",async function(){\n      spin(aiMapBtn);\n      try{\n        /* build context: source column names per source, and output column list */\n        var srcDescs=[];\n        for(var si=0;si<report.sources.length;si++){\n          var src=report.sources[si];\n          try{\n            var cols=await apiGet(\"sources.describe\",{savedSearchId:src.savedSearchId});\n            srcDescs.push({id:src.id,name:src.name,columns:cols.map(function(c){return c.label;})});\n          }catch(e2){toast(\"e\",\"Skip \"+src.name+\": \"+e2.message);}\n        }\n        var nonComputed=report.columns.filter(function(c){return c.type!==\"COMPUTED\";});\n        var prompt=\"Output columns to map:\\n\"+JSON.stringify(nonComputed.map(function(c){return{key:c.key,label:c.label};}))\n          +\"\\n\\nSources:\\n\"+JSON.stringify(srcDescs.map(function(s){return{id:s.id,name:s.name,columns:s.columns};}))\n          +\"\\n\\nFor each combination of sourceId and outputKey, suggest the best matching source column label. \"\n          +\"Return a JSON object with keys formatted as 'sourceId::outputKey' and values as the matching source column label string. \"\n          +\"Only include entries where a confident match exists.\";\n        var txt=await aiSuggest(\"map\",prompt);\n        /* parse JSON from response */\n        var raw=txt.replace(/```json|```/g,\"\").trim();\n        var suggestions=JSON.parse(raw);\n        var n=0;\n        Object.keys(suggestions).forEach(function(k){\n          if(!mapEdits[k]){mapEdits[k]=suggestions[k];n++;}\n        });\n        renderMapGrid(gridDiv);\n        toast(\"s\",\"AI suggested \"+n+\" mapping\"+(n!==1?\"s\":\"\"));\n      }catch(e){toast(\"e\",\"AI mapping failed: \"+e.message);}\n      unspin(aiMapBtn);\n    });\n    saveMapBtn.addEventListener(\"click\",async function(){spin(saveMapBtn);try{var maps=[];report.sources.forEach(function(s){report.columns.forEach(function(c){var v=(mapEdits[s.id+\"::\"+c.key]||\"\").trim();if(v)maps.push({sourceId:s.id,outputKey:c.key,label:v,internalId:\"\"});});});await apiPost(\"mappings.upsert\",{reportId:report.id,mappings:maps});toast(\"s\",\"Mappings saved (\"+maps.length+\")\");await reload();}catch(e){toast(\"e\",e.message);unspin(saveMapBtn);}});\n    mappingsWrap.appendChild(el(\"div\",{cls:\"card\"},[el(\"div\",{style:\"display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:14px;gap:12px\"},[el(\"div\",{},[el(\"div\",{cls:\"card-title\",style:\"margin-bottom:2px\",txt:\"Field Mappings\"}),el(\"div\",{cls:\"muted\",style:\"font-size:11px\"},[\"Enter the source column label for each output column. Use Auto-map per source, or AI Map All for cross-source suggestions.\"])]),el(\"div\",{cls:\"row\"},[semMapBtn,aiMapBtn,saveMapBtn])]),gridDiv]));\n    renderMapGrid(gridDiv);\n  }\n  function renderMapGrid(container){\n    container.innerHTML=\"\";\n    var nonComputed=report.columns.filter(function(c){return c.type!==\"COMPUTED\";});\n    if(!report.sources.length||!nonComputed.length){container.appendChild(el(\"div\",{cls:\"empty\",txt:\"Add sources and non-computed columns first.\"}));return;}\n    var thead=el(\"thead\"),hrow=el(\"tr\");hrow.appendChild(el(\"th\",{txt:\"Output Column\"}));\n    report.sources.forEach(function(src){\n      var autoBtn=el(\"button\",{cls:\"sm\",style:\"font-size:10px;padding:2px 7px;margin-left:6px\",txt:\"Auto-map\"});\n      autoBtn.addEventListener(\"click\",async function(){\n        spin(autoBtn);\n        try{var cols=await apiGet(\"sources.describe\",{savedSearchId:src.savedSearchId});var byLabel={};cols.forEach(function(c){byLabel[c.label.toLowerCase().trim()]=c.label;});var n=0;nonComputed.forEach(function(col){var k=src.id+\"::\"+col.key;if(mapEdits[k])return;var match=byLabel[col.label.toLowerCase().trim()]||byLabel[col.key.toLowerCase().trim()];if(match){mapEdits[k]=match;n++;}});renderMapGrid(container);toast(\"s\",\"Auto-mapped \"+n+\" field\"+(n!==1?\"s\":\"\"));}\n        catch(e){toast(\"e\",e.message);}\n        unspin(autoBtn); /* FIX: was missing */\n      });\n      var th=el(\"th\");th.appendChild(document.createTextNode(src.name+\" \"));th.appendChild(autoBtn);hrow.appendChild(th);\n    });\n    thead.appendChild(hrow);\n    var tbody=el(\"tbody\");\n    nonComputed.forEach(function(col){\n      var tr=el(\"tr\");\n      var info=el(\"td\");info.appendChild(el(\"div\",{cls:\"mono\",style:\"font-weight:600\",txt:col.key}));info.appendChild(el(\"div\",{cls:\"muted\",style:\"font-size:11px\",txt:col.label+\" \u00b7 \"+col.type}));tr.appendChild(info);\n      report.sources.forEach(function(src){var k=src.id+\"::\"+col.key;var inp=el(\"input\",{value:mapEdits[k]||\"\",placeholder:\"source column label\"});inp.addEventListener(\"input\",function(){mapEdits[k]=inp.value;});var td=el(\"td\");td.appendChild(inp);tr.appendChild(td);});\n      tbody.appendChild(tr);\n    });\n    container.appendChild(el(\"div\",{cls:\"tw\"},[el(\"table\",{cls:\"map-grid\"},[thead,tbody])]));\n  }\n\n  /* Flag Rules */\n  function renderFlags(){\n    flagsWrap.innerHTML=\"\";\n    var flags=JSON.parse(JSON.stringify(report.flags||[]));\n    var listDiv=el(\"div\"),saveFlagsBtn=el(\"button\",{cls:\"primary\",txt:\"Save Rules\"}),addFlagBtn=el(\"button\",{txt:\"+ Add Rule\"});\n    function renderFlagList(){\n      listDiv.innerHTML=\"\";\n      if(!flags.length){listDiv.appendChild(el(\"div\",{cls:\"empty\"},[\"No flag rules yet. Click \\\"+ Add Rule\\\" to define a condition. Rows matching a rule are highlighted in preview and exported to a Flags sheet.\"]));return;}\n      flags.forEach(function(fl,idx){\n        /* FIX: closure-in-loop \u2014 capture index and object via IIFE */\n        (function(i,flag){\n          var nameInp=el(\"input\",{value:flag.name||\"\",placeholder:\"Balance Mismatch\"});\n          var condInp=el(\"input\",{value:flag.condition||\"\",placeholder:\"{balance} > 0 AND {status} == 'Closed'\"});\n          var sevSel=el(\"select\",{style:\"max-width:110px\"});[{v:\"INFO\",t:\"\u2139 Info\"},{v:\"WARN\",t:\"\u26a0 Warn\"},{v:\"ERROR\",t:\"\ud83d\udd34 Error\"}].forEach(function(x){sevSel.appendChild(el(\"option\",{value:x.v,txt:x.t}));});sevSel.value=flag.severity||\"WARN\";\n          var colorInp=el(\"input\",{type:\"color\",value:flag.color||\"#f59e0b\",style:\"width:36px;height:28px;padding:2px;border-radius:6px;cursor:pointer;border:1px solid var(--bord)\"});\n          var delBtn=el(\"button\",{cls:\"sm danger\",txt:\"\u2715 Remove\"});\n          nameInp.addEventListener(\"input\",function(){flag.name=nameInp.value;});\n          condInp.addEventListener(\"input\",function(){flag.condition=condInp.value;});\n          sevSel.addEventListener(\"change\",function(){flag.severity=sevSel.value;});\n          colorInp.addEventListener(\"input\",function(){flag.color=colorInp.value;});\n          delBtn.addEventListener(\"click\",function(){flags.splice(i,1);renderFlagList();});\n          var flagAiBtn=aiBtn(\"Generate Condition\",async function(){\n            var desc=prompt(\"Describe the anomaly to flag (e.g. \\\"closed orders with outstanding balance\\\"):\",\"\");\n            if(!desc)return;\n            spin(flagAiBtn);\n            try{\n              var colKeys=report.columns.map(function(c){return c.key+\"(\"+c.label+\",\"+c.type+\")\";});\n              var txt=await aiSuggest(\"flag\",\"Available columns: \"+colKeys.join(\", \")+\". Flag condition to generate: \"+desc+\" Return only the condition expression using {column_key} syntax.\");\n              condInp.value=txt.trim().replace(/^[\"\\'`]+|[\"\\'`]+$/g,\"\");\n              flag.condition=condInp.value;\n              toast(\"s\",\"Condition generated\");\n            }catch(e){toast(\"e\",\"AI error: \"+e.message);}\n            unspin(flagAiBtn);\n          });\n          var row=el(\"div\",{cls:\"flag-row\"});\n          row.appendChild(el(\"div\",{cls:\"field\",style:\"max-width:200px\"},[el(\"label\",{txt:\"Rule Name\"}),nameInp]));\n          row.appendChild(el(\"div\",{cls:\"field\",style:\"flex:1\"},[el(\"label\",{txt:\"Condition (use {column_key})\"}),el(\"div\",{cls:\"row\",style:\"align-items:center;gap:6px;margin-bottom:4px\"},[el(\"div\",{style:\"flex:1\"},[condInp]),flagAiBtn]),el(\"div\",{cls:\"hint-text\",txt:\"Operators: > < == != AND OR NOT \u00b7 e.g. {amount} > 1000 AND {status} == 'Open'\"})]));\n          row.appendChild(el(\"div\",{cls:\"field\",style:\"max-width:120px\"},[el(\"label\",{txt:\"Severity\"}),sevSel]));\n          row.appendChild(el(\"div\",{cls:\"field\",style:\"max-width:60px\"},[el(\"label\",{txt:\"Color\"}),colorInp]));\n          row.appendChild(el(\"div\",{style:\"display:flex;align-items:flex-end;padding-bottom:2px\"},[delBtn]));\n          listDiv.appendChild(row);\n        })(idx,fl);\n      });\n    }\n    addFlagBtn.addEventListener(\"click\",function(){flags.push({name:\"\",condition:\"\",severity:\"WARN\",color:\"#f59e0b\"});renderFlagList();});\n    saveFlagsBtn.addEventListener(\"click\",async function(){spin(saveFlagsBtn);try{await apiPost(\"flags.upsert\",{reportId:report.id,flags:flags});toast(\"s\",\"Flag rules saved\");await reload();}catch(e){toast(\"e\",e.message);}unspin(saveFlagsBtn);});\n    flagsWrap.appendChild(el(\"div\",{cls:\"card\"},[el(\"div\",{style:\"display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:14px;gap:12px\"},[el(\"div\",{},[el(\"div\",{cls:\"card-title\",style:\"margin-bottom:2px\",txt:\"Flag Rules\"}),el(\"div\",{cls:\"muted\",style:\"font-size:11px\"},[\"Define conditions to surface anomalous rows. Matched rows appear highlighted in preview and in a separate Flags sheet on export.\"])]),el(\"div\",{cls:\"row\"},[addFlagBtn,saveFlagsBtn])]),listDiv]));\n    renderFlagList();\n  }\n\n  /* Pivots */\n  function renderPivots(){\n    pivotsWrap.innerHTML=\"\";\n    var pivots=JSON.parse(JSON.stringify(report.pivots||[]));\n    var listDiv=el(\"div\"),savePivBtn=el(\"button\",{cls:\"primary\",txt:\"Save Pivots\"}),addPivBtn=el(\"button\",{txt:\"+ Add Pivot\"});\n    var colKeys=report.columns.map(function(c){return c.key;});\n    function renderPivotList(){\n      listDiv.innerHTML=\"\";\n      if(!pivots.length){listDiv.appendChild(el(\"div\",{cls:\"empty\"},[\"No pivot definitions yet. Each pivot creates a grouped summary sheet in the Excel export.\"]));return;}\n      pivots.forEach(function(pv,idx){\n        /* FIX: closure-in-loop \u2014 capture via IIFE */\n        (function(i,pivot){\n          var lblInp=el(\"input\",{value:pivot.label||\"\",placeholder:\"Revenue by Customer\"});\n          var grpSel=el(\"select\");[{v:\"\",t:\"\u2014 group by column \u2014\"}].concat(colKeys.map(function(k){return{v:k,t:k};})).forEach(function(x){grpSel.appendChild(el(\"option\",{value:x.v,txt:x.t}));});grpSel.value=pivot.groupKey||\"\";\n          var aggSel=el(\"select\");[{v:\"\",t:\"\u2014 aggregate column \u2014\"}].concat(colKeys.map(function(k){return{v:k,t:k};})).forEach(function(x){aggSel.appendChild(el(\"option\",{value:x.v,txt:x.t}));});aggSel.value=pivot.aggKey||\"\";\n          var funcSel=el(\"select\",{style:\"max-width:90px\"});[\"SUM\",\"COUNT\",\"AVG\",\"MAX\",\"MIN\"].forEach(function(v){funcSel.appendChild(el(\"option\",{value:v,txt:v}));});funcSel.value=pivot.aggFunc||\"SUM\";\n          var delBtn=el(\"button\",{cls:\"sm danger\",txt:\"\u2715 Remove\"});\n          lblInp.addEventListener(\"input\",function(){pivot.label=lblInp.value;});\n          grpSel.addEventListener(\"change\",function(){pivot.groupKey=grpSel.value;});\n          aggSel.addEventListener(\"change\",function(){pivot.aggKey=aggSel.value;});\n          funcSel.addEventListener(\"change\",function(){pivot.aggFunc=funcSel.value;});\n          delBtn.addEventListener(\"click\",function(){pivots.splice(i,1);renderPivotList();});\n          var row=el(\"div\",{cls:\"flag-row\"});\n          row.appendChild(el(\"div\",{cls:\"field\"},[el(\"label\",{txt:\"Sheet Label\"}),lblInp]));\n          row.appendChild(el(\"div\",{cls:\"field\",style:\"max-width:170px\"},[el(\"label\",{txt:\"Group By\"}),grpSel]));\n          row.appendChild(el(\"div\",{cls:\"field\",style:\"max-width:100px\"},[el(\"label\",{txt:\"Function\"}),funcSel]));\n          row.appendChild(el(\"div\",{cls:\"field\",style:\"max-width:170px\"},[el(\"label\",{txt:\"Aggregate Column\"}),aggSel]));\n          row.appendChild(el(\"div\",{style:\"display:flex;align-items:flex-end;padding-bottom:2px\"},[delBtn]));\n          listDiv.appendChild(row);\n        })(idx,pv);\n      });\n    }\n    addPivBtn.addEventListener(\"click\",function(){pivots.push({label:\"\",groupKey:\"\",aggKey:\"\",aggFunc:\"SUM\"});renderPivotList();});\n    savePivBtn.addEventListener(\"click\",async function(){spin(savePivBtn);try{await apiPost(\"pivots.upsert\",{reportId:report.id,pivots:pivots});toast(\"s\",\"Pivots saved\");await reload();}catch(e){toast(\"e\",e.message);}unspin(savePivBtn);});\n    pivotsWrap.appendChild(el(\"div\",{cls:\"card\"},[el(\"div\",{style:\"display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:14px;gap:12px\"},[el(\"div\",{},[el(\"div\",{cls:\"card-title\",style:\"margin-bottom:2px\",txt:\"Pivot / Summary Sheets\"}),el(\"div\",{cls:\"muted\",style:\"font-size:11px\"},[\"Each pivot creates a grouped summary sheet in the Excel export.\"])]),el(\"div\",{cls:\"row\"},[addPivBtn,savePivBtn])]),listDiv]));\n    renderPivotList();\n  }\n\n  /* Reload */\n  async function reload(keepMapEdits){\n    gerr(\"\");if(!keepMapEdits)mapInited=false;\n    report=await apiGet(\"reports.get\",{reportId:rid});\n    pillSpan.textContent=report.name+\"  #\"+report.id;\n    document.title=\"Builder \u2013 \"+report.name;\n    clearDirty();\n    renderSettings();renderSources();renderColumns();renderMappings();renderFlags();renderPivots();scheduleWrap.innerHTML=\"\";buildSchedulePanel(rid,scheduleWrap);\n  }\n  goRunBtn.addEventListener(\"click\",function(){navTo(\"/run\",{rid:rid});});\n  var kbSave=function(e){if((e.ctrlKey||e.metaKey)&&e.key===\"s\"){e.preventDefault();saveBtn.click();}};\n  document.addEventListener(\"keydown\",kbSave);\n  window._sfCleanup=function(){document.removeEventListener(\"keydown\",kbSave);};\n  try{await reload();}catch(e){gerr(\"Failed to load: \"+e.message);}\n}\n\n/* \u2550\u2550 Run View \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550 */\nasync function viewRun(rid){\n  setSidebarActive(\"/reports\");app.innerHTML=\"\";\n  var pillSpan=el(\"span\",{cls:\"pill pill-d\"}),backBtn=el(\"button\",{txt:\"\u2190 Builder\"});\n  var titleRow=el(\"div\",{cls:\"ptitle\",style:\"display:flex;align-items:center;gap:12px\"});\n  titleRow.appendChild(document.createTextNode(\"Run Report \"));titleRow.appendChild(pillSpan);\n  titleRow.appendChild(el(\"div\",{style:\"margin-left:auto\"},[backBtn]));\n  var filtersTA=el(\"textarea\",{placeholder:'Runtime filters JSON (optional)\\ne.g. [[\"trandate\",\"onorafter\",\"1/1/2026\"]]',style:\"min-height:64px\"});\n  var recipInp=el(\"input\",{placeholder:\"ops@example.com, finance@example.com\"});\n  var prevBtn=el(\"button\",{cls:\"primary\",txt:\"\u25b6 Preview\"});\n  var csvBtn=el(\"button\",{txt:\"Export CSV\"}),xlsBtn=el(\"button\",{txt:\"Export EXCEL\"}),pdfBtn=el(\"button\",{txt:\"Export PDF\"});\n  var rcntSpan=el(\"span\",{cls:\"pill pill-d\",txt:\"\u2014\"}),flagCntSpan=el(\"span\",{cls:\"pill pill-f\",style:\"display:none\"});\n  var pprevBtn=el(\"button\",{txt:\"\u2190 Prev\"});pprevBtn.disabled=true;\n  var pnextBtn=el(\"button\",{txt:\"Next \u2192\"});pnextBtn.disabled=true;\n  var pinfoSpan=el(\"span\",{cls:\"muted\",txt:\"\"});\n\n  /* FIX: tab system uses data-tab attribute, not textContent comparison */\n  var tabDefs=[\"Merged\",\"Flags\",\"Summary\",\"Pivots\"];\n  var activeTab=\"Merged\";\n  var tabBtns={},tabPanels={};\n  var tabBar=el(\"div\",{cls:\"tab-bar\"}),tabContent=el(\"div\");\n  tabDefs.forEach(function(t){\n    var btn=el(\"button\",{cls:\"tab-btn\"+(t===\"Merged\"?\" active\":\"\"),txt:t,\"data-tab\":t});\n    btn.addEventListener(\"click\",function(){\n      activeTab=t;\n      qsa(\".tab-btn\",tabBar).forEach(function(b){b.classList.toggle(\"active\",b.dataset.tab===t);});\n      Object.keys(tabPanels).forEach(function(k){tabPanels[k].style.display=k===t?\"block\":\"none\";});\n      renderActiveTab();\n    });\n    tabBtns[t]=btn;tabBar.appendChild(btn);\n    tabPanels[t]=el(\"div\",{style:\"display:\"+(t===\"Merged\"?\"block\":\"none\")});\n    tabContent.appendChild(tabPanels[t]);\n  });\n  var diagPre=el(\"pre\",{cls:\"diag-pre\"});\n  app.appendChild(titleRow);\n  app.appendChild(el(\"div\",{cls:\"card\"},[el(\"div\",{cls:\"row\"},[el(\"div\",{cls:\"field\"},[el(\"label\",{txt:\"Runtime Filters (JSON, optional)\"}),filtersTA]),el(\"div\",{cls:\"field\",style:\"max-width:300px\"},[el(\"label\",{txt:\"Email Recipients (optional)\"}),recipInp])]),(el(\"div\",{cls:\"row\",style:\"margin-top:10px;gap:8px\"},[prevBtn,csvBtn,xlsBtn,pdfBtn]))]));\n  app.appendChild(el(\"div\",{cls:\"card\"},[el(\"div\",{style:\"display:flex;align-items:center;gap:10px;margin-bottom:12px;flex-wrap:wrap\"},[el(\"div\",{style:\"font-weight:700\",txt:\"Preview\"}),rcntSpan,flagCntSpan,el(\"div\",{cls:\"row\",style:\"margin-left:auto;gap:6px;align-items:center\"},[pprevBtn,pinfoSpan,pnextBtn])]),tabBar,tabContent,el(\"details\",{style:\"margin-top:12px\"},[el(\"summary\",{style:\"cursor:pointer;color:var(--muted);font-size:12px;user-select:none\",txt:\"\u25b8 Raw Diagnostics\"}),diagPre])]));\n\n  var offset=0,limit=50,lastData=null;\n  backBtn.addEventListener(\"click\",function(){navTo(\"/builder\",{rid:rid});});\n  try{var r=await apiGet(\"reports.get\",{reportId:rid});pillSpan.textContent=r.name+\"  #\"+r.id;document.title=\"Run \u2013 \"+r.name;}catch(e){}\n\n  function parseFilters(){var raw=filtersTA.value.trim();if(!raw)return\"\";try{JSON.parse(raw);return raw;}catch(e){throw new Error(\"Invalid JSON filters: \"+e.message);}}\n\n  function renderActiveTab(){\n    if(activeTab===\"Merged\")  renderMergedTab();\n    if(activeTab===\"Flags\")   renderFlagsTab();\n    if(activeTab===\"Summary\") renderSummaryTab();\n    if(activeTab===\"Pivots\")  renderPivotsTab();\n  }\n\n  function renderMergedTab(){\n    var panel=tabPanels[\"Merged\"];panel.innerHTML=\"\";\n    if(!lastData){panel.appendChild(el(\"div\",{cls:\"empty run-empty\"},[\"Click \u25b6 Preview above to run the report.\"]));return;}\n    var rows=lastData.rows||[],cols=lastData.report.columns||[];\n    if(!rows.length){panel.appendChild(el(\"div\",{cls:\"empty\",txt:\"No results returned.\"}));return;}\n    var tbody=el(\"tbody\");\n    rows.forEach(function(row){\n      var tr=el(\"tr\");\n      if(row.__flags&&row.__flags.length){\n        var flagDefs=(lastData.report.flags||[]).filter(function(f){return row.__flags.indexOf(f.name)>=0;});\n        if(flagDefs.length&&flagDefs[0].color)tr.style.borderLeft=\"3px solid \"+flagDefs[0].color;\n        tr.title=\"\u2691 Flags: \"+row.__flags.join(\", \");tr.classList.add(\"flagged-row\");\n      }\n      tr.appendChild(el(\"td\",{cls:\"muted\",style:\"white-space:nowrap\",txt:row.__sourceName||\"\"}));\n      cols.forEach(function(c){var td=el(\"td\",{txt:String(row[c.key]==null?\"\":row[c.key])});if(c.type===\"COMPUTED\")td.style.color=\"var(--accent)\";tr.appendChild(td);});\n      tbody.appendChild(tr);\n    });\n    var hrow=el(\"tr\");hrow.appendChild(el(\"th\",{txt:\"Source\"}));\n    cols.forEach(function(c){hrow.appendChild(el(\"th\",{txt:c.label||c.key+(c.type===\"COMPUTED\"?\" \u2295\":\"\")}));});\n    panel.appendChild(el(\"div\",{cls:\"tw\"},[el(\"table\",{},[el(\"thead\",{},[hrow]),tbody])]));\n  }\n\n  function renderFlagsTab(){\n    var panel=tabPanels[\"Flags\"];panel.innerHTML=\"\";\n    if(!lastData){panel.appendChild(el(\"div\",{cls:\"empty\",txt:\"Run preview first.\"}));return;}\n    var flagged=(lastData.rows||[]).filter(function(r){return r.__flags&&r.__flags.length;});\n    if(!flagged.length){panel.appendChild(el(\"div\",{cls:\"empty\",style:\"color:var(--green)\",txt:\"\u2713 No flagged rows in this page. All clear!\"}));return;}\n    var cols=lastData.report.columns||[];\n    var tbody=el(\"tbody\");\n    flagged.forEach(function(row){\n      var tr=el(\"tr\");\n      var flagDefs=(lastData.report.flags||[]).filter(function(f){return row.__flags.indexOf(f.name)>=0;});\n      if(flagDefs.length&&flagDefs[0].color)tr.style.borderLeft=\"3px solid \"+flagDefs[0].color;\n      tr.appendChild(el(\"td\",{cls:\"muted\",txt:row.__sourceName||\"\"}));\n      tr.appendChild(el(\"td\",{style:\"font-weight:600;color:var(--yellow)\",txt:row.__flags.join(\", \")}));\n      cols.forEach(function(c){tr.appendChild(el(\"td\",{txt:String(row[c.key]==null?\"\":row[c.key])}));});\n      tbody.appendChild(tr);\n    });\n    var hrow=el(\"tr\");hrow.appendChild(el(\"th\",{txt:\"Source\"}));hrow.appendChild(el(\"th\",{txt:\"Flags Triggered\"}));\n    cols.forEach(function(c){hrow.appendChild(el(\"th\",{txt:c.label||c.key}));});\n    panel.appendChild(el(\"div\",{cls:\"tw\"},[el(\"table\",{},[el(\"thead\",{},[hrow]),tbody])]));\n  }\n\n  function renderSummaryTab(){\n    var panel=tabPanels[\"Summary\"];panel.innerHTML=\"\";\n    if(!lastData){panel.appendChild(el(\"div\",{cls:\"empty\",txt:\"Run preview first.\"}));return;}\n    var any=false;\n    var totals=lastData.totals||{},tkeys=Object.keys(totals);\n    if(tkeys.length){any=true;var tb=el(\"tbody\");tkeys.forEach(function(k){tb.appendChild(el(\"tr\",{},[el(\"td\",{style:\"font-weight:600\",txt:k}),el(\"td\",{txt:Number(totals[k].toFixed(2)).toLocaleString()})]));});panel.appendChild(el(\"div\",{style:\"margin-bottom:18px\"},[el(\"div\",{cls:\"card-title\",txt:\"Column Totals\"}),el(\"div\",{cls:\"tw\"},[el(\"table\",{},[el(\"thead\",{},[el(\"tr\",{},[el(\"th\",{txt:\"Column\"}),el(\"th\",{txt:\"Total\"})])]),tb])])]));}\n    var fsumm=lastData.flagSummary||[];\n    if(fsumm.length){any=true;var fb=el(\"tbody\");fsumm.forEach(function(f){var sp=el(\"span\",{cls:\"pill pill-\"+(f.severity===\"ERROR\"?\"f\":f.severity===\"INFO\"?\"d\":\"q\"),txt:f.severity});fb.appendChild(el(\"tr\",{},[el(\"td\",{style:\"font-weight:600\",txt:f.name}),el(\"td\",{},[sp]),el(\"td\",{txt:f.count+\" row\"+(f.count!==1?\"s\":\"\")})]));});panel.appendChild(el(\"div\",{style:\"margin-bottom:18px\"},[el(\"div\",{cls:\"card-title\",txt:\"Flag Summary\"}),el(\"div\",{cls:\"tw\"},[el(\"table\",{},[el(\"thead\",{},[el(\"tr\",{},[el(\"th\",{txt:\"Rule\"}),el(\"th\",{txt:\"Severity\"}),el(\"th\",{txt:\"Count\"})])]),fb])])]));}\n    var anom=lastData.anomalies||[];\n    if(anom.length){any=true;var ab=el(\"tbody\");anom.forEach(function(a){if(a.type===\"missing_required\")ab.appendChild(el(\"tr\",{},[el(\"td\",{txt:\"Missing required fields\"}),el(\"td\",{txt:a.count+\" cells\"})]));if(a.type===\"negative_values\"){Object.keys(a.fields).forEach(function(k){ab.appendChild(el(\"tr\",{},[el(\"td\",{txt:\"Negative values: \"+k}),el(\"td\",{txt:a.fields[k]+\" rows\"})]));});}});panel.appendChild(el(\"div\",[el(\"div\",{cls:\"card-title\",txt:\"Anomalies\"}),el(\"div\",{cls:\"tw\"},[el(\"table\",{},[el(\"thead\",{},[el(\"tr\",{},[el(\"th\",{txt:\"Issue\"}),el(\"th\",{txt:\"Count\"})])]),ab])])]));}\n    if(!any)panel.appendChild(el(\"div\",{cls:\"empty\",txt:\"Nothing to summarize. Add numeric columns or flag rules.\"}));\n    /* AI Insights */\n    var insightsWrap=el(\"div\",{style:\"margin-top:18px\"});\n    var insightsBtn=aiBtn(\"Analyze Report\",async function(){\n      spin(insightsBtn);\n      insightsDiv.textContent=\"\";\n      insightsDiv.style.display=\"block\";\n      insightsDiv.appendChild(el(\"div\",{cls:\"loading-row\"},[el(\"span\",{cls:\"spin\"}),\" Analyzing\u2026\"]));\n      try{\n        var ctx={\n          rowCount:lastData.rowCount,\n          mergeMode:lastData.report&&lastData.report.mergeMode,\n          columns:(lastData.report&&lastData.report.columns||[]).map(function(c){return{key:c.key,label:c.label,type:c.type};}),\n          totals:lastData.totals||{},\n          flagSummary:lastData.flagSummary||[],\n          anomalies:lastData.anomalies||[]\n        };\n        var prompt=\"Report data summary:\\n\"+JSON.stringify(ctx,null,2)+\"\\n\\nPlease provide a concise 3-5 sentence executive summary of this report, highlighting key findings, any concerning patterns, and actionable observations.\";\n        var txt=await aiSuggest(\"insights\",prompt);\n        insightsDiv.innerHTML=\"\";\n        insightsDiv.appendChild(el(\"p\",{style:\"line-height:1.7;color:var(--txt);font-size:13px\",txt:txt}));\n      }catch(e){insightsDiv.innerHTML=\"\";insightsDiv.appendChild(el(\"div\",{cls:\"etxt\",txt:e.message}));}\n      unspin(insightsBtn);\n    });\n    var insightsDiv=el(\"div\",{style:\"display:none;margin-top:10px;padding:14px;background:rgba(59,130,246,.06);border:1px solid rgba(59,130,246,.2);border-radius:10px\"});\n    insightsWrap.appendChild(el(\"div\",{style:\"display:flex;align-items:center;gap:10px;margin-bottom:6px\"},[el(\"div\",{cls:\"card-title\",style:\"margin-bottom:0\",txt:\"AI Insights\"}),insightsBtn]));\n    insightsWrap.appendChild(el(\"div\",{cls:\"muted\",style:\"font-size:11px;margin-bottom:10px\"},[\"Analyzes the current preview result and provides an executive summary.\"]));\n    insightsWrap.appendChild(insightsDiv);\n    panel.appendChild(insightsWrap);\n  }\n\n  function renderPivotsTab(){\n    var panel=tabPanels[\"Pivots\"];panel.innerHTML=\"\";\n    if(!lastData){panel.appendChild(el(\"div\",{cls:\"empty\",txt:\"Run preview first.\"}));return;}\n    var pvs=lastData.pivots||[];\n    if(!pvs.length){panel.appendChild(el(\"div\",{cls:\"empty\"},[\"No pivot definitions. Add them in Builder \u2192 Pivot / Summary Sheets.\"]));return;}\n    pvs.forEach(function(pv){\n      var tbody=el(\"tbody\");\n      (pv.rows||[]).forEach(function(r){tbody.appendChild(el(\"tr\",{},[el(\"td\",{style:\"font-weight:600\",txt:r.group}),el(\"td\",{txt:Number((r.value||0).toFixed(2)).toLocaleString()}),el(\"td\",{cls:\"muted\",txt:r.count+\" rows\"})]));});\n      panel.appendChild(el(\"div\",{style:\"margin-bottom:18px\"},[el(\"div\",{cls:\"card-title\",txt:pv.label||(pv.groupKey+\" \u2192 \"+pv.aggFunc+\"(\"+pv.aggKey+\")\")}),el(\"div\",{cls:\"tw\"},[el(\"table\",{},[el(\"thead\",{},[el(\"tr\",{},[el(\"th\",{txt:pv.groupKey}),el(\"th\",{txt:pv.aggFunc+\"(\"+pv.aggKey+\")\"}),el(\"th\",{txt:\"Rows\"})])]),tbody])])]));\n    });\n  }\n\n  async function doPreview(){\n    spin(prevBtn);\n    tabPanels[\"Merged\"].innerHTML=\"\";tabPanels[\"Merged\"].appendChild(el(\"div\",{cls:\"loading-row\",style:\"padding:20px\"},[el(\"span\",{cls:\"spin\"}),\" Running pipeline\u2026\"]));\n    try{\n      var f=parseFilters();\n      lastData=await apiGet(\"runs.preview\",{reportId:rid,runtimeFilters:f,offset:String(offset),limit:String(limit)});\n      var rc=lastData.rowCount,o=lastData.offset,l=lastData.limit;\n      rcntSpan.textContent=rc.toLocaleString()+\" rows\";rcntSpan.className=\"pill pill-\"+(rc>0?\"s\":\"d\");\n      if(lastData.flaggedCount){flagCntSpan.style.display=\"\";flagCntSpan.textContent=lastData.flaggedCount+\" flagged\";}else{flagCntSpan.style.display=\"none\";}\n      tabBtns[\"Flags\"].innerHTML=\"Flags\"+(lastData.flaggedCount?\"<span class='tab-cnt'>\"+lastData.flaggedCount+\"</span>\":\"\");\n      pprevBtn.disabled=o<=0;pnextBtn.disabled=o+l>=rc;\n      pinfoSpan.textContent=rc>0?(o+1)+\"\u2013\"+Math.min(o+l,rc)+\" of \"+rc.toLocaleString():\"\";\n      diagPre.textContent=JSON.stringify({mergeMode:lastData.report.mergeMode,rowCount:rc,totals:lastData.totals,anomalies:lastData.anomalies,flagSummary:lastData.flagSummary},null,2);\n      renderActiveTab();\n    }catch(e){toast(\"e\",e.message);tabPanels[\"Merged\"].innerHTML=\"\";tabPanels[\"Merged\"].appendChild(el(\"div\",{cls:\"etxt\",style:\"padding:16px\",txt:e.message}));}\n    unspin(prevBtn);\n  }\n\n  async function doExport(fmt){try{var d=await apiPost(\"runs.export\",{reportId:rid,format:fmt,runtimeFilters:parseFilters(),recipients:recipInp.value.trim()});toast(\"i\",\"Export started \u2014 Run ID: \"+d.runId,6000);}catch(e){toast(\"e\",e.message);}}\n\n  prevBtn.addEventListener(\"click\",function(){offset=0;doPreview();});\n  pprevBtn.addEventListener(\"click\",function(){offset=Math.max(0,offset-limit);doPreview();});\n  pnextBtn.addEventListener(\"click\",function(){offset+=limit;doPreview();});\n  csvBtn.addEventListener(\"click\",function(){doExport(\"CSV\");});xlsBtn.addEventListener(\"click\",function(){doExport(\"EXCEL\");});pdfBtn.addEventListener(\"click\",function(){doExport(\"PDF\");});\n\n  /* Show empty state on load, don't auto-run */\n  tabPanels[\"Merged\"].appendChild(el(\"div\",{cls:\"empty run-empty\"},[\"Click \u25b6 Preview above to run the report.\"]));\n}\n\n/* \u2550\u2550 History View \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550 */\nasync function viewHistory(){\n  setSidebarActive(\"/history\");app.innerHTML=\"\";document.title=\"SearchFusion \u2013 History\";\n  var hridInp=el(\"input\",{placeholder:\"Report ID \u2014 leave blank for all\"});\n  var hstsSel=el(\"select\");[{v:\"\",t:\"All statuses\"},{v:\"QUEUED\",t:\"QUEUED\"},{v:\"RUNNING\",t:\"RUNNING\"},{v:\"SUCCESS\",t:\"SUCCESS\"},{v:\"FAILED\",t:\"FAILED\"}].forEach(function(x){hstsSel.appendChild(el(\"option\",{value:x.v,txt:x.t}));});\n  var loadBtn=el(\"button\",{cls:\"primary\",txt:\"Load\"}),refreshBtn=el(\"button\",{txt:\"\u27f3 Refresh\"}),htableDiv=el(\"div\");\n  htableDiv.appendChild(el(\"div\",{cls:\"empty\",txt:\"Click Load to fetch run history.\"}));\n  app.appendChild(el(\"div\",{cls:\"ptitle\",txt:\"Run History\"}));\n  app.appendChild(el(\"div\",{cls:\"card\"},[el(\"div\",{cls:\"row\"},[el(\"div\",{cls:\"field\",style:\"max-width:220px\"},[el(\"label\",{txt:\"Report ID\"}),hridInp]),el(\"div\",{cls:\"field\",style:\"max-width:200px\"},[el(\"label\",{txt:\"Status\"}),hstsSel]),loadBtn,refreshBtn])]));\n  app.appendChild(el(\"div\",{cls:\"card\"},[htableDiv]));\n  var pollTimer=null;\n  async function load(){\n    spin(loadBtn);htableDiv.innerHTML=\"\";htableDiv.appendChild(el(\"div\",{cls:\"loading-row\"},[el(\"span\",{cls:\"spin\"}),\" Loading\u2026\"]));\n    try{\n      var params={};if(hridInp.value.trim())params.reportId=hridInp.value.trim();if(hstsSel.value)params.status=hstsSel.value;\n      var rows=await apiGet(\"runs.history\",params);\n      clearTimeout(pollTimer);if(rows.some(function(r){return r.status===\"RUNNING\"||r.status===\"QUEUED\";}))pollTimer=setTimeout(load,8000);\n      htableDiv.innerHTML=\"\";\n      if(!rows.length){htableDiv.appendChild(el(\"div\",{cls:\"empty\",txt:\"No runs found.\"}));unspin(loadBtn);return;}\n      var tbody=el(\"tbody\");\n      rows.forEach(function(r){\n        var files=[];if(r.files){try{var p=JSON.parse(r.files);if(Array.isArray(p))files=p;}catch(e){}}\n        var statusTd=el(\"td\");statusTd.innerHTML=statusPill(r.status);if(r.error)statusTd.appendChild(el(\"div\",{cls:\"etxt\",style:\"margin-top:4px;font-size:11px\",txt:r.error}));\n        var filesTd=el(\"td\");\n        if(files.length){files.forEach(function(fid){var a=el(\"a\",{txt:\"\u2b07 Download\",style:\"color:var(--accent);text-decoration:none;display:block;font-size:12px\"});a.href=apiUrl(\"files.download\",{fileId:String(fid)});a.target=\"_blank\";filesTd.appendChild(a);});}\n        else{filesTd.appendChild(el(\"span\",{cls:\"muted\",txt:\"\u2014\"}));}\n        tbody.appendChild(el(\"tr\",{},[el(\"td\",{cls:\"mono muted\",txt:r.id}),el(\"td\",{cls:\"mono muted\",txt:r.reportId||\"\u2014\"}),el(\"td\",{cls:\"muted\",style:\"white-space:nowrap;font-size:12px\",txt:r.created||\"\u2014\"}),statusTd,el(\"td\",{txt:r.rows?String(r.rows):\"\u2014\"}),el(\"td\",{txt:r.format||\"\u2014\"}),filesTd]));\n      });\n      htableDiv.appendChild(el(\"div\",{cls:\"tw\"},[el(\"table\",{},[el(\"thead\",{},[el(\"tr\",{},[el(\"th\",{txt:\"Run ID\"}),el(\"th\",{txt:\"Report\"}),el(\"th\",{txt:\"Created\"}),el(\"th\",{txt:\"Status\"}),el(\"th\",{txt:\"Rows\"}),el(\"th\",{txt:\"Format\"}),el(\"th\",{txt:\"Files\"})])]),tbody])]));\n    }catch(e){toast(\"e\",e.message);htableDiv.innerHTML=\"\";}\n    unspin(loadBtn);\n  }\n  loadBtn.addEventListener(\"click\",load);refreshBtn.addEventListener(\"click\",load);\n  window._sfCleanup=function(){clearTimeout(pollTimer);};\n  await load();\n}\n\n/* \u2550\u2550 Schedule Panel (used inside Builder) \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550 */\nfunction buildSchedulePanel(rid,container){\n  var listDiv=el(\"div\"),saveScBtn=el(\"button\",{cls:\"primary\",txt:\"Save Schedule\"});\n  async function loadAndRender(){\n    listDiv.innerHTML=\"\";listDiv.appendChild(el(\"div\",{cls:\"loading-row\"},[el(\"span\",{cls:\"spin\"}),\" Loading\u2026\"]));\n    try{\n      var rows=await apiGet(\"schedules.get\",{reportId:rid});\n      var sd=rows[0]||{active:true,frequency:\"DAILY\",hour:\"08\",dayOfWeek:\"1\",dayOfMonth:\"1\",recipients:\"\",folderId:\"\",formats:\"CSV\",emailSubject:\"\",emailBody:\"\",runtimeFilters:\"\",customInterval:4,customUnit:\"HOURS\"};\n      listDiv.innerHTML=\"\";\n      var actSel=el(\"select\",{style:\"max-width:110px\"});\n      [{v:\"true\",t:\"Active\"},{v:\"false\",t:\"Inactive\"}].forEach(function(x){actSel.appendChild(el(\"option\",{value:x.v,txt:x.t}));});actSel.value=sd.active?\"true\":\"false\";\n      var freqSel=el(\"select\",{style:\"max-width:160px\"});\n      [{v:\"HOURLY\",t:\"Every Hour\"},{v:\"DAILY\",t:\"Daily\"},{v:\"WEEKLY\",t:\"Weekly\"},{v:\"MONTHLY\",t:\"Monthly\"},{v:\"EVERY_N\",t:\"Custom Interval\"}].forEach(function(x){freqSel.appendChild(el(\"option\",{value:x.v,txt:x.t}));});freqSel.value=sd.frequency||\"DAILY\";\n      var hourInp=el(\"input\",{type:\"number\",value:sd.hour||\"08\",placeholder:\"08\",style:\"max-width:70px\",min:\"0\",max:\"23\"});\n      var dowSel=el(\"select\",{style:\"max-width:140px\"});\n      [{v:\"1\",t:\"Monday\"},{v:\"2\",t:\"Tuesday\"},{v:\"3\",t:\"Wednesday\"},{v:\"4\",t:\"Thursday\"},{v:\"5\",t:\"Friday\"},{v:\"6\",t:\"Saturday\"},{v:\"0\",t:\"Sunday\"}].forEach(function(x){dowSel.appendChild(el(\"option\",{value:x.v,txt:x.t}));});dowSel.value=sd.dayOfWeek||\"1\";\n      var domInp=el(\"input\",{type:\"number\",value:sd.dayOfMonth||\"1\",placeholder:\"1\",style:\"max-width:70px\",min:\"1\",max:\"28\"});\n      var cintInp=el(\"input\",{type:\"number\",value:String(sd.customInterval||4),placeholder:\"4\",style:\"max-width:70px\",min:\"1\"});\n      var ciunSel=el(\"select\",{style:\"max-width:100px\"});\n      [{v:\"HOURS\",t:\"Hours\"},{v:\"DAYS\",t:\"Days\"}].forEach(function(x){ciunSel.appendChild(el(\"option\",{value:x.v,txt:x.t}));});ciunSel.value=sd.customUnit||\"HOURS\";\n      var recipInp=el(\"input\",{value:sd.recipients||\"\",placeholder:\"ops@example.com, finance@example.com\"});\n      var folderInp=el(\"input\",{value:sd.folderId||\"\",placeholder:\"NetSuite folder ID\",style:\"max-width:200px\"});\n      var fmtsSel=el(\"select\");\n      [{v:\"CSV\",t:\"CSV\"},{v:\"EXCEL\",t:\"Excel\"},{v:\"PDF\",t:\"PDF\"},{v:\"CSV,EXCEL\",t:\"CSV + Excel\"},{v:\"CSV,EXCEL,PDF\",t:\"All Formats\"}].forEach(function(x){fmtsSel.appendChild(el(\"option\",{value:x.v,txt:x.t}));});fmtsSel.value=sd.formats||\"CSV\";\n      var subjInp=el(\"input\",{value:sd.emailSubject||\"\",placeholder:\"SearchFusion Report: {report_name}\"});\n      var bodyTA=el(\"textarea\",{style:\"min-height:60px\"});bodyTA.value=sd.emailBody||\"\";\n      var rfTA=el(\"textarea\",{style:\"min-height:44px\",placeholder:'Runtime filters JSON e.g. [[\"trandate\",\"onorafter\",\"1/1/2026\"]]'});rfTA.value=sd.runtimeFilters||\"\";\n      var freqRow=el(\"div\",{cls:\"row\",style:\"margin-top:8px;flex-wrap:wrap\"});\n      function updFreq(){\n        freqRow.innerHTML=\"\";\n        var f=freqSel.value;\n        if(f===\"DAILY\"){freqRow.appendChild(el(\"div\",{cls:\"field\",style:\"max-width:110px\"},[el(\"label\",{txt:\"Hour (0-23)\"}),hourInp]));}\n        else if(f===\"WEEKLY\"){freqRow.appendChild(el(\"div\",{cls:\"field\",style:\"max-width:160px\"},[el(\"label\",{txt:\"Day of Week\"}),dowSel]));freqRow.appendChild(el(\"div\",{cls:\"field\",style:\"max-width:110px\"},[el(\"label\",{txt:\"Hour (0-23)\"}),hourInp]));}\n        else if(f===\"MONTHLY\"){freqRow.appendChild(el(\"div\",{cls:\"field\",style:\"max-width:110px\"},[el(\"label\",{txt:\"Day of Month\"}),domInp]));freqRow.appendChild(el(\"div\",{cls:\"field\",style:\"max-width:110px\"},[el(\"label\",{txt:\"Hour (0-23)\"}),hourInp]));}\n        else if(f===\"EVERY_N\"){freqRow.appendChild(el(\"div\",{cls:\"field\",style:\"max-width:100px\"},[el(\"label\",{txt:\"Every\"}),cintInp]));freqRow.appendChild(el(\"div\",{cls:\"field\",style:\"max-width:110px\"},[el(\"label\",{txt:\"Unit\"}),ciunSel]));freqRow.appendChild(el(\"div\",{cls:\"field\",style:\"max-width:110px\"},[el(\"label\",{txt:\"Hour (0-23)\"}),hourInp]));}\n      }\n      freqSel.addEventListener(\"change\",updFreq);updFreq();\n      listDiv.appendChild(el(\"div\",{cls:\"row\",style:\"flex-wrap:wrap\"},[el(\"div\",{cls:\"field\",style:\"max-width:130px\"},[el(\"label\",{txt:\"Status\"}),actSel]),el(\"div\",{cls:\"field\",style:\"max-width:180px\"},[el(\"label\",{txt:\"Frequency\"}),freqSel])]));\n      listDiv.appendChild(freqRow);\n      listDiv.appendChild(el(\"div\",{cls:\"row\",style:\"margin-top:12px;flex-wrap:wrap\"},[el(\"div\",{cls:\"field\"},[el(\"label\",{txt:\"Recipients (comma-separated)\"}),recipInp]),el(\"div\",{cls:\"field\",style:\"max-width:200px\"},[el(\"label\",{txt:\"Export Formats\"}),fmtsSel]),el(\"div\",{cls:\"field\",style:\"max-width:200px\"},[el(\"label\",{txt:\"Destination Folder ID\"}),folderInp])]));\n      listDiv.appendChild(el(\"div\",{cls:\"row\",style:\"margin-top:8px\"},[el(\"div\",{cls:\"field\"},[el(\"label\",{txt:\"Email Subject\"}),subjInp])]));\n      listDiv.appendChild(el(\"div\",{cls:\"row\",style:\"margin-top:8px\"},[el(\"div\",{cls:\"field\"},[el(\"label\",{txt:\"Email Body (optional)\"}),bodyTA])]));\n      listDiv.appendChild(el(\"div\",{cls:\"row\",style:\"margin-top:8px\"},[el(\"div\",{cls:\"field\"},[el(\"label\",{txt:\"Runtime Filters (JSON, optional)\"}),rfTA])]));\n      if(sd.nextRun||sd.lastRun){var infoRow=el(\"div\",{cls:\"row muted\",style:\"margin-top:8px;font-size:12px;gap:16px\"});if(sd.nextRun)infoRow.appendChild(el(\"span\",{txt:\"Next run: \"+sd.nextRun}));if(sd.lastRun)infoRow.appendChild(el(\"span\",{txt:\"Last run: \"+sd.lastRun}));listDiv.appendChild(infoRow);}\n      saveScBtn.onclick=async function(){spin(saveScBtn);try{await apiPost(\"schedules.upsert\",{reportId:rid,schedule:{active:actSel.value===\"true\",frequency:freqSel.value,dayOfWeek:dowSel.value,dayOfMonth:domInp.value,hour:hourInp.value,customInterval:parseInt(cintInp.value||\"4\",10),customUnit:ciunSel.value,recipients:recipInp.value.trim(),folderId:folderInp.value.trim(),formats:fmtsSel.value,emailSubject:subjInp.value.trim(),emailBody:bodyTA.value.trim(),runtimeFilters:rfTA.value.trim()}});toast(\"s\",\"Schedule saved\");}catch(e){toast(\"e\",e.message);}unspin(saveScBtn);};\n    }catch(e){listDiv.innerHTML=\"\";listDiv.appendChild(el(\"div\",{cls:\"etxt\",txt:e.message}));}\n  }\n  container.appendChild(el(\"div\",{cls:\"card\"},[el(\"div\",{style:\"display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:14px;gap:12px\"},[el(\"div\",{},[el(\"div\",{cls:\"card-title\",style:\"margin-bottom:2px\",txt:\"Schedule\"}),el(\"div\",{cls:\"muted\",style:\"font-size:11px\"},[\"Configure automated runs. Requires the Schedule Map/Reduce script deployment. Supports custom intervals (Every N hours/days).\"])]),saveScBtn]),listDiv]));\n  loadAndRender();\n}\n\n/* \u2550\u2550 Router \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550 */\nqsa(\".nav-btn[data-route]\").forEach(function(b){b.addEventListener(\"click\",function(){location.hash=\"#\"+b.dataset.route;});});\nasync function render(){\n  if(window._sfCleanup){window._sfCleanup();window._sfCleanup=null;}\n  var r=route();\n  if(r.path===\"/reports\") return viewReports();\n  if(r.path===\"/builder\"&&r.params.get(\"rid\")) return viewBuilder(r.params.get(\"rid\"));\n  if(r.path===\"/run\"&&r.params.get(\"rid\"))     return viewRun(r.params.get(\"rid\"));\n  if(r.path===\"/history\") return viewHistory();\n  location.hash=\"#/reports\";\n}\nwindow.addEventListener(\"hashchange\",function(){render().catch(function(e){toast(\"e\",\"Navigation error: \"+e.message);});});\nrender().catch(function(e){toast(\"e\",\"Startup error: \"+e.message);});\n";
    var html = "<!doctype html><html lang=\"en\"><head>\n<meta charset=\"utf-8\"/><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"/>\n<title>SearchFusion</title>\n<link rel=\"preconnect\" href=\"https://fonts.googleapis.com\"/>\n<link href=\"https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap\" rel=\"stylesheet\"/>\n<style>CSS_PLACEHOLDER</style>\n</head><body>\n<div id=\"toasts\"></div>\n<div class=\"layout\">\n  <nav class=\"sidebar\">\n    <div class=\"logo\"><svg width=\"18\" height=\"18\" fill=\"none\" viewBox=\"0 0 24 24\" stroke=\"currentColor\" stroke-width=\"2\"><path d=\"M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z\"/></svg>SearchFusion</div>\n    <button class=\"nav-btn\" data-route=\"/reports\"><svg width=\"14\" height=\"14\" fill=\"none\" viewBox=\"0 0 24 24\" stroke=\"currentColor\" stroke-width=\"2\"><rect x=\"3\" y=\"3\" width=\"7\" height=\"7\"/><rect x=\"14\" y=\"3\" width=\"7\" height=\"7\"/><rect x=\"14\" y=\"14\" width=\"7\" height=\"7\"/><rect x=\"3\" y=\"14\" width=\"7\" height=\"7\"/></svg>Reports</button>\n    <button class=\"nav-btn\" data-route=\"/history\"><svg width=\"14\" height=\"14\" fill=\"none\" viewBox=\"0 0 24 24\" stroke=\"currentColor\" stroke-width=\"2\"><circle cx=\"12\" cy=\"12\" r=\"10\"/><path d=\"M12 6v6l4 2\"/></svg>Run History</button>\n  </nav>\n  <main class=\"main\" id=\"app\"></main>\n</div>\n<script>CLIENT_PLACEHOLDER</script>\n</body></html>";
    html = html.replace('CSS_PLACEHOLDER', CSS_VAR).replace('CLIENT_PLACEHOLDER', CLIENT_VAR);
    res.write(html);
  }

  function onRequest(ctx) {
    var req = ctx.request, res = ctx.response;
    if (req.parameters.action) return handleApi(req, res);
    return renderUi(res);
  }

  return { onRequest: onRequest };
});
