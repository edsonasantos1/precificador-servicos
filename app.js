/* Interface do Precificador de Serviços: orçamento rápido + configuração da empresa */
(function () {
  'use strict';
  const C = window.Calc;
  const KEY = 'precificador.v1';
  const $ = s => document.querySelector(s);
  const brl = v => (isFinite(v) ? v : 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const pct = v => ((isFinite(v) ? v : 0) * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%';
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const fmtIn = v => (v === '' || v == null) ? '' : String(v).replace('.', ',');
  const curto = s => { const t = String(s || '').replace(/\.$/, ''); return t.length > 60 ? t.slice(0, 58).replace(/[ ,]+\S*$/, '') + '…' : t; };

  const EXEMPLO = {
    exemplo: true,
    empresa: { regime: 'simples', ano: 2027, rbt12: 360000, anexo: 'III', folha12: 90000, issPct: 5, dasMei: 86.05, lucroAlto: false },
    custos: {
      fixos: [{ nome: 'Aluguel e condomínio', valor: 2200 }, { nome: 'Energia, internet e telefone', valor: 450 },
        { nome: 'Contabilidade', valor: 600 }, { nome: 'Softwares e sistemas', valor: 300 }, { nome: 'Veículo (manutenção e seguro)', valor: 650 }],
      proLabore: 6000, salarios: 2500, encargosPct: 36.2, pessoas: 2, horasDia: 8, diasMes: 21, produtividadePct: 85
    },
    servico: { item: '01.07', nbs: 0, cclass: '000001', respostas: {} },
    recentes: ['01.07', '14.02', '07.10'],
    trabalho: { horas: 6, materiais: 180, terceiros: '', outros: '', km: 30, rsKm: 1.1, horasViagem: '', pedagios: '',
      comissaoPct: 3, margemPct: 20, comprasComCreditoPct: 100, parcelas: 3, jurosPct: 2 }
  };
  const VAZIO = {
    exemplo: false,
    empresa: { regime: 'simples', ano: 2027, rbt12: '', anexo: 'III', folha12: '', issPct: 5, dasMei: 86.05, lucroAlto: false },
    custos: { fixos: [{ nome: 'Aluguel', valor: '' }], proLabore: '', salarios: '', encargosPct: 36.2, pessoas: 1, horasDia: 8, diasMes: 21, produtividadePct: 85 },
    servico: { item: null, nbs: 0, cclass: '000001', respostas: {} },
    recentes: [],
    trabalho: { horas: '', materiais: '', terceiros: '', outros: '', km: '', rsKm: 1.1, horasViagem: '', pedagios: '',
      comissaoPct: '', margemPct: 20, comprasComCreditoPct: 100, parcelas: 1, jurosPct: 0 }
  };

  const clone = o => JSON.parse(JSON.stringify(o));
  let S = clone(EXEMPLO), DB = null, detalhesAbertos = false;
  try { const raw = localStorage.getItem(KEY); if (raw) S = Object.assign(clone(EXEMPLO), JSON.parse(raw)); } catch (e) { /* sem armazenamento */ }
  if (!Array.isArray(S.recentes)) S.recentes = [];
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* ignora */ } };
  const get = p => p.split('.').reduce((o, k) => o?.[k], S);
  const set = (p, v) => { const ks = p.split('.'); const last = ks.pop(); ks.reduce((o, k) => o[k], S)[last] = v; };

  // ---------- telas ----------
  function mostrar() {
    const emp = location.hash === '#empresa';
    $('#view-empresa').hidden = !emp; $('#view-orcamento').hidden = emp; $('#mobilebar').hidden = emp;
    $('#go-empresa').hidden = emp; $('#go-orcamento').hidden = !emp;
    window.scrollTo(0, 0);
  }
  const ir = h => { if (location.hash !== h) location.hash = h; else mostrar(); };
  window.addEventListener('hashchange', mostrar);
  $('#go-empresa').onclick = () => ir('#empresa');
  $('#cfg-agora').onclick = () => ir('#empresa');
  $('#go-orcamento').onclick = $('#cfg-pronto').onclick = () => { history.replaceState(null, '', location.pathname + location.search); mostrar(); };

  // ---------- campos ----------
  const anoSel = $('#empresa-ano');
  Object.keys(C.ANOS).forEach(a => { const o = document.createElement('option'); o.value = a; o.textContent = a + (a === '2026' ? ' (teste)' : a === '2033' ? ' (sistema completo)' : ''); anoSel.appendChild(o); });

  function fillForm() {
    document.querySelectorAll('[data-k]').forEach(el => {
      const v = get(el.dataset.k);
      if (el.type === 'checkbox') el.checked = !!v;
      else if (el.tagName === 'SELECT') el.value = String(v);
      else el.value = el.hasAttribute('data-num') ? fmtIn(v) : (v ?? '');
    });
    renderFixos();
  }
  const naoExemplo = el => { if (el.closest('#view-empresa')) S.exemplo = false; };
  document.addEventListener('input', ev => {
    const el = ev.target; if (!el.dataset || !el.dataset.k) return;
    let v = el.type === 'checkbox' ? el.checked : el.value;
    if (el.hasAttribute('data-num') && el.tagName === 'SELECT') v = Number(v);
    set(el.dataset.k, v); naoExemplo(el); update();
  });
  const passo = d => { const m = Math.max(0, Math.min(80, C.num(S.trabalho.margemPct) + d)); S.trabalho.margemPct = m; $('#t-margem').value = fmtIn(m); update(); };
  $('#m-menos').onclick = () => passo(-5); $('#m-mais').onclick = () => passo(5);

  function renderFixos() {
    const box = $('#fixos'); box.innerHTML = '';
    S.custos.fixos.forEach((f, i) => {
      const r = document.createElement('div'); r.className = 'fixo';
      r.innerHTML = `<input id="fixo-nome-${i}" aria-label="Despesa" value="${esc(f.nome)}" placeholder="Despesa">
        <input id="fixo-valor-${i}" class="num" inputmode="decimal" aria-label="Valor mensal em reais" value="${esc(fmtIn(f.valor))}" placeholder="R$/mês">
        <button type="button" aria-label="Remover ${esc(f.nome)}">×</button>`;
      r.children[0].addEventListener('input', e => { f.nome = e.target.value; S.exemplo = false; save(); });
      r.children[1].addEventListener('input', e => { f.valor = e.target.value; S.exemplo = false; update(); });
      r.children[2].addEventListener('click', () => { S.custos.fixos.splice(i, 1); renderFixos(); update(); });
      box.appendChild(r);
    });
  }
  $('#add-fixo').onclick = () => { S.custos.fixos.push({ nome: '', valor: '' }); renderFixos(); $('#fixo-nome-' + (S.custos.fixos.length - 1)).focus(); };
  $('#btn-exemplo').onclick = () => { S = clone(EXEMPLO); fillForm(); renderServico(); update(); };
  const limpar = $('#btn-limpar');
  limpar.onclick = () => {
    if (limpar.dataset.confirmar !== '1') { limpar.dataset.confirmar = '1'; limpar.textContent = 'Toque de novo para apagar'; setTimeout(() => { limpar.dataset.confirmar = ''; limpar.textContent = 'Apagar tudo e começar do zero'; }, 4000); return; }
    limpar.dataset.confirmar = ''; limpar.textContent = 'Apagar tudo e começar do zero';
    S = clone(VAZIO); fillForm(); renderServico(); update();
  };

  // ---------- serviços ----------
  const busca = $('#busca'), lista = $('#resultados');
  fetch('servicos.json').then(r => r.json()).then(d => {
    DB = d; DB.servicos.forEach(s => { s._q = norm(s.item + ' ' + s.descricao + ' ' + s.nbs.map(n => n.descricao).join(' ')); });
    renderServico(); update();
  }).catch(() => { $('#svc-now').innerHTML = '<span class="hint">Não foi possível carregar a lista de serviços. O cálculo segue sem redução de CBS/IBS.</span>'; update(); });

  busca.addEventListener('input', () => {
    const q = norm(busca.value).trim();
    if (!DB || q.length < 2) { lista.hidden = true; return; }
    const termos = q.split(/\s+/);
    const achados = DB.servicos.filter(s => termos.every(t => s._q.includes(t))).slice(0, 40);
    lista.innerHTML = achados.length ? achados.map(s => `<button type="button" data-item="${s.item}"><span class="code">${s.item}</span><span>${esc(s.descricao)}</span></button>`).join('')
      : '<p class="hint" style="padding:10px">Nenhum serviço encontrado. Tente outra palavra ou o código.</p>';
    lista.hidden = false;
  });
  function escolher(item) {
    if (S.servico.item !== item) S.servico = { item, nbs: 0, cclass: null, respostas: {} };
    S.recentes = [item, ...S.recentes.filter(x => x !== item)].slice(0, 6);
    busca.value = ''; lista.hidden = true; renderServico(); update();
  }
  lista.addEventListener('click', e => { const b = e.target.closest('button[data-item]'); if (b) escolher(b.dataset.item); });
  $('#recentes').addEventListener('click', e => { const b = e.target.closest('button[data-item]'); if (b) escolher(b.dataset.item); });

  const servicoAtual = () => DB && S.servico.item ? DB.servicos.find(s => s.item === S.servico.item) : null;

  // Redução só vale com "sim" quando há pergunta; sem pergunta, aplica direto.
  function decidirClasse(nbs) {
    const cs = nbs.cClassTrib;
    for (const c of cs) {
      if (c === '000001') continue;
      const R = DB.reducoes[c];
      if (!R.pergunta || S.servico.respostas[c] === true) return c;
    }
    return cs.includes('000001') ? '000001' : (cs.find(c => S.servico.respostas[c] !== false) || '000001');
  }

  function renderServico() {
    const s = servicoAtual();
    $('#recentes').innerHTML = DB ? S.recentes.filter(i => DB.servicos.some(x => x.item === i)).map(i => {
      const x = DB.servicos.find(y => y.item === i);
      return `<button type="button" data-item="${i}" aria-pressed="${S.servico.item === i}" title="${esc(x.descricao)}">${esc(curto(x.descricao).split(/[,(]/)[0])}</button>`;
    }).join('') : '';
    if (!s) { $('#svc-now').innerHTML = DB ? '<span class="hint">Escolha o serviço que vai orçar.</span>' : '<span class="hint">Carregando serviços…</span>'; $('#perguntas').innerHTML = ''; return; }
    if (S.servico.nbs >= s.nbs.length) S.servico.nbs = 0;
    const nb = s.nbs[S.servico.nbs];
    S.servico.cclass = decidirClasse(nb);
    const R = DB.reducoes[S.servico.cclass] || DB.reducoes['000001'];
    const temRed = R.reducaoIBS || R.reducaoCBS;
    $('#svc-now').innerHTML = `<span class="code">${s.item}</span><b>${esc(curto(s.descricao))}</b>
      <span class="chip ${temRed ? 'good' : ''}">${temRed ? 'CBS/IBS −' + (R.reducaoIBS === R.reducaoCBS ? R.reducaoIBS + '%' : R.reducaoIBS + '/' + R.reducaoCBS + '%') : 'CBS/IBS cheia'}</span>
      ${R.regimeEspecifico ? '<span class="chip warn">regime específico</span>' : ''}`;
    const perguntas = nb.cClassTrib.filter(c => c !== '000001' && DB.reducoes[c].pergunta);
    const pend = perguntas.filter(c => S.servico.respostas[c] === undefined);
    $('#perguntas').innerHTML = `
      ${s.nbs.length > 1 ? `<details class="more"><summary>Tipo de serviço (NBS ${esc(nb.nbs || 's/ código')})</summary>
        <select id="sel-nbs" aria-label="Tipo de serviço (NBS)">${s.nbs.map((n, i) => `<option value="${i}" ${i === S.servico.nbs ? 'selected' : ''}>${esc((n.nbs || 's/ código') + ' · ' + n.descricao)}</option>`).join('')}</select></details>` : ''}
      ${pend.map(c => `<div class="q"><span>${esc(DB.reducoes[c].pergunta)}</span>
        <div class="opts"><button type="button" data-q="${c}" data-v="1">Sim</button><button type="button" data-q="${c}" data-v="0">Não</button></div></div>`).join('')}`;
    const sel = $('#sel-nbs'); if (sel) sel.onchange = e => { S.servico.nbs = +e.target.value; S.servico.respostas = {}; renderServico(); update(); };
    $('#perguntas').querySelectorAll('[data-q]').forEach(b => b.onclick = () => { S.servico.respostas[b.dataset.q] = b.dataset.v === '1'; renderServico(); update(); });
  }

  // ---------- cálculo e resultado ----------
  function reducao() {
    if (!DB || !S.servico.item) return { ibs: 0, cbs: 0, info: null };
    const R = DB.reducoes[S.servico.cclass] || DB.reducoes['000001'];
    return { ibs: R.reducaoIBS, cbs: R.reducaoCBS, info: R };
  }
  const NOMES = { mei: 'MEI', simples: 'Simples Nacional', simples_hibrido: 'Simples com CBS/IBS por fora', presumido: 'Lucro Presumido', real: 'Lucro Real' };
  const HINTS = {
    mei: 'O DAS-MEI é um valor fixo por mês e entra como custo fixo. O MEI não pode optar por CBS/IBS por fora.',
    simples: 'Tudo é pago no DAS. A partir de 2027, o cliente empresa só aproveita como crédito a parte de CBS/IBS que está dentro do DAS.',
    simples_hibrido: 'O DAS fica sem a parte de CBS/IBS, que é cobrada por fora com crédito integral para o cliente empresa. Opção em setembro (vale em janeiro) ou março (vale em julho), a partir de 2027.',
    presumido: 'IRPJ e CSLL sobre 32% da receita, ISS do município e, a partir de 2027, CBS/IBS por fora da nota.',
    real: 'IRPJ e CSLL sobre o lucro. A margem pedida já é a margem depois desses tributos.'
  };
  let ultimo = null;

  function update() {
    save();
    const e = S.empresa, reg = e.regime;
    $('#aviso-exemplo').hidden = !S.exemplo;
    document.querySelectorAll('[data-show]').forEach(el => { el.hidden = !el.dataset.show.split(' ').includes(reg); });
    $('#hint-regime').textContent = HINTS[reg] || '';
    const red = reducao();
    const calc = o => C.calcular(S, Object.assign({ reducao: red }, o));
    const r = calc({ ano: +e.ano });
    const ch = C.custoHora(S);
    $('#out-custohora').textContent = ch.horas > 0 ? `${brl(ch.valor)} · ${ch.horas.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} h/mês` : 'Informe as horas';

    const box = $('#preco');
    $('#mb-total').textContent = r.erro ? '–' : brl(r.nota);
    if (r.erro) { box.innerHTML = `<div class="price-head"><span class="eyebrow">Não deu para calcular</span><p class="alert">${esc(r.erro)}</p></div>`; ultimo = null; return; }
    ultimo = r;
    const s = servicoAtual();
    const tributos = r.tribDentro + r.ISS + r.ir + r.CBS + r.IBS;

    const partes = [['Custos', r.custo, 'var(--c-custo)'], ['Tributos', r.tribDentro + r.ISS + r.ir, 'var(--c-trib)'],
      ['Comissões e taxas', r.despVar, 'var(--c-var)'], ['Lucro', Math.max(r.lucro, 0), 'var(--c-lucro)'], ['CBS + IBS', r.CBS + r.IBS, 'var(--c-fora)']].filter(p => p[1] > 0.005);
    const tot = partes.reduce((a, p) => a + p[1], 0) || 1;

    const anos = Object.keys(C.ANOS).map(Number);
    const porAno = anos.map(a => ({ a, r: calc({ ano: a }) }));
    const maxNota = Math.max(...porAno.map(x => x.r.nota || 0)) || 1;

    let cmp = '';
    if ((reg === 'simples' || reg === 'simples_hibrido') && +e.ano >= 2027) {
      const p = calc({ ano: +e.ano, regime: 'simples' }), h = calc({ ano: +e.ano, regime: 'simples_hibrido' });
      const melhor = p.custoClienteEmpresa <= h.custoClienteEmpresa ? 'p' : 'h';
      cmp = `<div class="sec"><span class="eyebrow">Simples: dentro ou fora do DAS</span>
        <div class="cmp">
          <div class="${melhor === 'p' ? 'best' : ''}"><b>Dentro do DAS</b><span>Nota: <span class="mono">${brl(p.nota)}</span></span><span>Custo p/ cliente empresa: <span class="mono">${brl(p.custoClienteEmpresa)}</span></span></div>
          <div class="${melhor === 'h' ? 'best' : ''}"><b>Por fora</b><span>Nota: <span class="mono">${brl(h.nota)}</span></span><span>Custo p/ cliente empresa: <span class="mono">${brl(h.custoClienteEmpresa)}</span></span></div>
        </div><p class="hint">A opção destacada sai mais barata para cliente empresa, depois do crédito.</p></div>`;
    }

    const par = C.parcelas(r.nota, S.trabalho.parcelas, S.trabalho.jurosPct);
    const alertas = [...r.avisos];
    if (S.exemplo) { /* banner já avisa */ }
    if (ch.horas <= 0) alertas.push('Informe as horas disponíveis em "Empresa e custos" para calcular o custo da hora.');
    if (red.info && red.info.regimeEspecifico) alertas.push('Serviço com regime específico de CBS/IBS. Confirme o cálculo com seu contador.');
    if (red.info && (red.ibs || red.cbs) && (r.regime === 'simples' || r.regime === 'mei')) alertas.push('A redução de CBS/IBS deste serviço só vale para quem recolhe CBS/IBS por fora. No DAS a alíquota do Simples não muda.');
    if (!s && DB) alertas.push('Escolha o serviço para aplicar a redução de CBS/IBS correta.');

    box.innerHTML = `
      <div class="price-head">
        <span class="eyebrow">${NOMES[r.regime]} · ${r.ano}</span>
        <span>Cobre</span>
        <span class="big">${brl(r.nota)}</span>
        <span class="hint">${r.CBS + r.IBS > 0 ? `Serviço ${brl(r.preco)} + CBS/IBS ${brl(r.CBS + r.IBS)} na nota` : 'Valor total da nota fiscal'}</span>
      </div>
      <div class="kpis">
        <div>Lucro<b>${brl(r.lucro)}</b><span>${pct(r.margemLiquida)} do preço</span></div>
        <div>Custos<b>${brl(r.custo)}</b><span>${brl(r.custoHora.valor)}/h</span></div>
        <div>Tributos<b>${brl(tributos)}</b><span>${pct(tributos / (r.nota || 1))} da nota</span></div>
      </div>
      <div style="padding:0 16px 14px;display:grid;gap:6px">
        <div class="bar" role="img" aria-label="Composição do valor da nota">${partes.map(p => `<i style="width:${(p[1] / tot * 100).toFixed(2)}%;background:${p[2]}"></i>`).join('')}</div>
        <div class="legend">${partes.map(p => `<span style="--dot:${p[2]}">${p[0]} ${pct(p[1] / tot)}</span>`).join('')}</div>
      </div>
      ${alertas.length ? `<div style="padding:0 16px 14px;display:grid;gap:6px">${alertas.map(a => `<p class="alert">${esc(a)}</p>`).join('')}</div>` : ''}
      <div class="actions"><button type="button" class="primary" id="copiar">Copiar orçamento</button></div>
      <details class="det" id="detalhes" ${detalhesAbertos ? 'open' : ''}>
        <summary>Ver cálculo completo</summary>
        <div class="sec"><span class="eyebrow">Composição do preço</span>
          <div class="lines">
            <div><span>Mão de obra (${C.num(S.trabalho.horas).toLocaleString('pt-BR')} h × ${brl(r.custoHora.valor)})</span><span>${brl(r.maoDeObra)}</span></div>
            ${r.compras ? `<div><span>Material e terceiros</span><span>${brl(r.compras)}</span></div>` : ''}
            ${r.credito ? `<div class="sub"><span>(−) crédito de CBS/IBS nas compras</span><span>−${brl(r.credito)}</span></div>` : ''}
            ${r.deslocamento ? `<div><span>Deslocamento</span><span>${brl(r.deslocamento)}</span></div>` : ''}
            ${r.outros ? `<div><span>Outros custos</span><span>${brl(r.outros)}</span></div>` : ''}
            <div class="tot"><span>Custo do serviço</span><span>${brl(r.custo)}</span></div>
            ${r.tribDentro ? `<div><span>${r.simples ? `DAS (${pct(r.tDentro)}, Anexo ${r.simples.anexo}, faixa ${r.simples.faixa})` : `Tributos sobre a receita (${pct(r.tDentro)})`}</span><span>${brl(r.tribDentro)}</span></div>` : ''}
            ${r.ISS ? `<div><span>ISS (${pct(r.issAliq)})</span><span>${brl(r.ISS)}</span></div>` : ''}
            ${r.despVar ? `<div><span>Comissões e taxas</span><span>${brl(r.despVar)}</span></div>` : ''}
            ${r.ir ? `<div><span>IRPJ e CSLL sobre o lucro</span><span>${brl(r.ir)}</span></div>` : ''}
            <div class="tot"><span>Lucro</span><span>${brl(r.lucro)}</span></div>
            <div class="tot"><span>Preço do serviço</span><span>${brl(r.preco)}</span></div>
            ${r.CBS ? `<div><span>CBS (${pct(r.cbsAliq)})</span><span>${brl(r.CBS)}</span></div>` : ''}
            ${r.IBS ? `<div><span>IBS (${pct(r.ibsAliq)})</span><span>${brl(r.IBS)}</span></div>` : ''}
            <div class="tot"><span>Valor da nota</span><span>${brl(r.nota)}</span></div>
            ${r.teste ? `<div class="sub"><span>Teste de 2026 destacado na nota, sem cobrança: CBS ${brl(r.teste.cbs)} · IBS ${brl(r.teste.ibs)}</span><span></span></div>` : ''}
          </div>
          ${s ? `<p class="hint">${s.item} · NBS ${esc(s.nbs[S.servico.nbs].nbs || 's/ código')} · cClassTrib ${S.servico.cclass}${red.info && red.info.artigoLC214 ? ' · LC 214/2025, ' + esc(red.info.artigoLC214) : ''}</p>` : ''}
        </div>
        ${r.ano >= 2027 && r.regime !== 'mei' ? `<div class="sec"><span class="eyebrow">Se o cliente for empresa</span>
          <div class="lines"><div><span>Crédito de CBS/IBS que ele aproveita</span><span>${brl(r.creditoCliente)}</span></div>
          <div class="tot"><span>Custo real para ele</span><span>${brl(r.custoClienteEmpresa)}</span></div></div></div>` : ''}
        ${cmp}
        <div class="sec"><span class="eyebrow">O mesmo serviço em cada ano</span>
          <div class="years">${porAno.map(x => `<button type="button" class="yr" data-ano="${x.a}" aria-pressed="${x.a === +e.ano}"><span>${x.a}</span><span class="track"><i style="width:${((x.r.nota || 0) / maxNota * 100).toFixed(1)}%"></i></span><span class="v">${x.r.erro ? '–' : brl(x.r.nota)}</span></button>`).join('')}</div>
          <p class="hint">Valor da nota por ano, com os mesmos custos e margem. Toque num ano para usá-lo.</p></div>
        <div class="sec"><span class="eyebrow">Preço a prazo</span>
          <div class="row"><label class="f"><span>Parcelas</span><input id="t-parcelas" class="num" inputmode="numeric" value="${esc(fmtIn(S.trabalho.parcelas))}"></label>
          <label class="f"><span>Juros ao mês (%)</span><input id="t-juros" class="num" inputmode="decimal" value="${esc(fmtIn(S.trabalho.jurosPct))}"></label></div>
          <div class="lines"><div><span>${par.n}× de</span><span>${brl(par.parcela)}</span></div><div class="sub"><span>Total a prazo</span><span>${brl(par.total)}</span></div></div></div>
      </details>`;

    $('#detalhes').addEventListener('toggle', ev => { detalhesAbertos = ev.target.open; });
    box.querySelectorAll('.yr').forEach(b => b.onclick = () => { S.empresa.ano = +b.dataset.ano; anoSel.value = b.dataset.ano; update(); });
    const keep = (id, k) => { const el = $(id); el.oninput = () => { S.trabalho[k] = el.value; const pos = el.selectionStart; update(); const n2 = $(id); n2.focus(); try { n2.setSelectionRange(pos, pos); } catch (er) { /* ok */ } }; };
    keep('#t-parcelas', 'parcelas'); keep('#t-juros', 'jurosPct');
    $('#copiar').onclick = () => copiar(r, s, par);
  }

  function copiar(r, s, par) {
    const linhas = [
      'Orçamento' + (s ? ': ' + curto(s.descricao) : ''),
      'Valor: ' + brl(r.nota),
      r.CBS + r.IBS > 0 ? `(serviço ${brl(r.preco)} + CBS ${brl(r.CBS)} + IBS ${brl(r.IBS)})` : null,
      par.n > 1 ? `Ou ${par.n}x de ${brl(par.parcela)}` : null
    ].filter(Boolean).join('\n');
    const ok = () => toast('Orçamento copiado');
    try { navigator.clipboard.writeText(linhas).then(ok, () => fallback(linhas)); } catch (e) { fallback(linhas); }
  }
  function fallback(txt) {
    const t = document.createElement('textarea'); t.value = txt; t.setAttribute('readonly', ''); t.style.position = 'fixed'; t.style.opacity = '0';
    document.body.appendChild(t); t.select();
    let ok = false; try { ok = document.execCommand('copy'); } catch (e) { /* ignora */ }
    document.body.removeChild(t);
    toast(ok ? 'Orçamento copiado' : 'Não foi possível copiar. Anote o valor: ' + txt.split('\n')[1]);
  }
  function toast(msg) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast.h); toast.h = setTimeout(() => { t.hidden = true; }, 2500); }

  $('#mb-ver').onclick = () => $('#preco').scrollIntoView({ behavior: 'smooth', block: 'start' });
  fillForm(); renderServico(); mostrar(); update();
  if ('serviceWorker' in navigator) { try { navigator.serviceWorker.register('sw.js').catch(() => {}); } catch (e) { /* sem suporte */ } }
})();
