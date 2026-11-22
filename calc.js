/* Motor de cálculo do Precificador de Serviços.
   Regras: documento "Regras de cálculo do app de precificação" (22/11/2026). */
(function (root) {
  'use strict';

  // Alíquotas por ano. cbs/ibs = alíquota cheia do ano; iss = fração da alíquota municipal ainda vigente;
  // ibsProp = parte do ISS do DAS que já virou IBS (Simples); cobra = CBS/IBS efetivamente cobrados (2026 é teste).
  const ANOS = {
    2026: { cbs: 0.009, ibs: 0.001, iss: 1.0, ibsProp: 0,   pisCofins: true,  cobra: false },
    2027: { cbs: 0.087, ibs: 0.001, iss: 1.0, ibsProp: 0,   pisCofins: false, cobra: true },
    2028: { cbs: 0.087, ibs: 0.001, iss: 1.0, ibsProp: 0,   pisCofins: false, cobra: true },
    2029: { cbs: 0.088, ibs: 0.0177, iss: 0.9, ibsProp: 0.1, pisCofins: false, cobra: true },
    2030: { cbs: 0.088, ibs: 0.0354, iss: 0.8, ibsProp: 0.2, pisCofins: false, cobra: true },
    2031: { cbs: 0.088, ibs: 0.0531, iss: 0.7, ibsProp: 0.3, pisCofins: false, cobra: true },
    2032: { cbs: 0.088, ibs: 0.0708, iss: 0.6, ibsProp: 0.4, pisCofins: false, cobra: true },
    2033: { cbs: 0.088, ibs: 0.177,  iss: 0.0, ibsProp: 1.0, pisCofins: false, cobra: true }
  };

  // Simples Nacional (LC 123/2006): [limite RBT12, alíquota nominal, parcela a deduzir, % PIS+Cofins no DAS, % ISS no DAS]
  const SIMPLES = {
    III: [[180000, .06, 0, .156, .335], [360000, .112, 9360, .171, .32], [720000, .135, 17640, .166, .325],
          [1800000, .16, 35640, .166, .325], [3600000, .21, 125640, .156, .335], [4800000, .33, 648000, .195, 0]],
    IV:  [[180000, .045, 0, .215, .445], [360000, .09, 8100, .25, .40], [720000, .102, 12420, .24, .40],
          [1800000, .14, 39780, .23, .40], [3600000, .22, 183780, .22, .40], [4800000, .33, 828000, .25, 0]],
    V:   [[180000, .155, 0, .1715, .14], [360000, .18, 4500, .1715, .17], [720000, .195, 9900, .1815, .19],
          [1800000, .205, 17100, .1915, .21], [3600000, .23, 62100, .1715, .235], [4800000, .305, 540000, .20, 0]]
  };
  const LIMITE_MEI = 81000;

  const n = v => (typeof v === 'number' && isFinite(v)) ? v : (parseFloat(String(v ?? '').replace(/\./g, '').replace(',', '.')) || 0);

  function simplesEfetiva(anexo, rbt12) {
    const tab = SIMPLES[anexo] || SIMPLES.III;
    const f = tab.find(r => rbt12 <= r[0]) || tab[tab.length - 1];
    const ef = rbt12 > 0 ? (rbt12 * f[1] - f[2]) / rbt12 : f[1];
    return { efetiva: Math.max(ef, 0), nominal: f[1], faixa: tab.indexOf(f) + 1, shPisCofins: f[3], shIss: f[4] };
  }

  function anexoAplicado(e) {
    if (e.anexo === 'V' && n(e.rbt12) > 0 && n(e.folha12) / n(e.rbt12) >= 0.28) return 'III';
    return e.anexo || 'III';
  }

  function custoHora(s) {
    const c = s.custos;
    const fixos = (c.fixos || []).reduce((a, x) => a + n(x.valor), 0);
    const folha = n(c.salarios) * (1 + n(c.encargosPct) / 100);
    const das = s.empresa.regime === 'mei' ? n(s.empresa.dasMei) : 0;
    const horas = n(c.pessoas) * n(c.horasDia) * n(c.diasMes) * n(c.produtividadePct) / 100;
    const mensal = fixos + n(c.proLabore) + folha + das;
    return { fixos, folha, das, mensal, horas, valor: horas > 0 ? mensal / horas : 0 };
  }

  // Calcula o preço de um serviço para um ano e regime.
  function calcular(s, opts) {
    opts = opts || {};
    const ano = opts.ano || n(s.empresa.ano) || 2027;
    const A = ANOS[ano] || ANOS[2027];
    const regimeIn = opts.regime || s.empresa.regime;
    const regime = (regimeIn === 'simples_hibrido' && ano < 2027) ? 'simples' : regimeIn;
    const red = opts.reducao || s.reducao || { ibs: 0, cbs: 0 };
    const t = s.trabalho, e = s.empresa;
    const avisos = [];

    const ch = custoHora(s);
    const horasServ = n(t.horas), horasViagem = n(t.horasViagem);
    const maoDeObra = horasServ * ch.valor;
    const deslocamento = n(t.km) * n(t.rsKm) + horasViagem * ch.valor + n(t.pedagios);
    const compras = n(t.materiais) + n(t.terceiros);
    const regular = ['presumido', 'real', 'simples_hibrido'].includes(regime);
    let credito = 0;
    if (regular && A.cobra) {
      const a = A.cbs + A.ibs;
      credito = compras * (n(t.comprasComCreditoPct) / 100) * a / (1 + a);
    }
    const C = maoDeObra + deslocamento + compras + n(t.outros) - credito;

    // Tributos por dentro (t), ISS separado nos regimes fora do Simples
    let tDentro = 0, issAliq = 0, sn = null, irLucro = 0;
    const issMun = n(e.issPct) / 100;
    if (regime === 'mei') {
      tDentro = 0;
      if (n(e.rbt12) > LIMITE_MEI) avisos.push('O faturamento informado passa do limite anual do MEI (R$ 81.000).');
    } else if (regime === 'simples' || regime === 'simples_hibrido') {
      sn = simplesEfetiva(anexoAplicado(e), n(e.rbt12));
      sn.anexo = anexoAplicado(e);
      tDentro = regime === 'simples' ? sn.efetiva : sn.efetiva * (1 - sn.shPisCofins - sn.shIss * A.ibsProp);
    } else if (regime === 'presumido') {
      tDentro = 0.32 * 0.15 + 0.32 * 0.09 + (e.lucroAlto ? 0.32 * 0.10 : 0) + (A.pisCofins ? 0.0365 : 0);
      issAliq = issMun * A.iss;
    } else if (regime === 'real') {
      tDentro = A.pisCofins ? 0.0925 : 0;
      issAliq = issMun * A.iss;
      irLucro = e.lucroAlto ? 0.34 : 0.24;
    }
    const v = n(t.comissaoPct) / 100;
    const m = n(t.margemPct) / 100;
    const mBruta = irLucro ? m / (1 - irLucro) : m;
    const divisor = 1 - tDentro - v - mBruta;
    if (divisor <= 0.05) {
      return { erro: 'A soma de tributos, despesas variáveis e margem chega perto de 100% do preço. Reduza a margem ou as despesas variáveis.' };
    }
    const porFora = regular && A.cobra;
    const cbsAliq = A.cbs * (1 - n(red.cbs) / 100), ibsAliq = A.ibs * (1 - n(red.ibs) / 100);
    const issNaBase = ano >= 2027 && ano <= 2032;
    let P = C / divisor, ISS = 0, CBS = 0, IBS = 0;
    for (let i = 0; i < 60; i++) {
      const B = P - ISS;
      CBS = porFora ? B * cbsAliq : 0;
      IBS = porFora ? B * ibsAliq : 0;
      ISS = issAliq * (issNaBase ? P + CBS + IBS : P);
      const Pn = (C + ISS) / divisor;
      if (Math.abs(Pn - P) < 1e-7) { P = Pn; break; }
      P = Pn;
    }
    // 2026: CBS/IBS de teste, só destacados (sem cobrança)
    const teste = !A.cobra && regular !== undefined && ['presumido', 'real'].includes(regime)
      ? { cbs: P * A.cbs * (1 - n(red.cbs) / 100), ibs: P * A.ibs * (1 - n(red.ibs) / 100) } : null;

    const tribDentro = P * tDentro;
    const despVar = P * v;
    const lucroAntesIR = P - C - tribDentro - ISS - despVar;
    const ir = irLucro ? lucroAntesIR * irLucro : 0;
    const lucro = lucroAntesIR - ir;
    const nota = P + CBS + IBS;

    let creditoCliente = 0;
    if (porFora) creditoCliente = CBS + IBS;
    else if (regime === 'simples' && A.cobra) creditoCliente = P * sn.efetiva * (sn.shPisCofins + sn.shIss * A.ibsProp);

    if (regimeIn === 'simples_hibrido' && ano < 2027) avisos.push('A opção pelo regime regular de CBS/IBS só vale a partir de 2027; o cálculo de 2026 usa o Simples normal.');

    return {
      ano, regime, custoHora: ch, maoDeObra, deslocamento, compras, outros: n(t.outros), credito, custo: C,
      tDentro, tribDentro, ISS, issAliq, despVar, ir, lucro, margemLiquida: P > 0 ? lucro / P : 0,
      preco: P, CBS, IBS, cbsAliq: porFora ? cbsAliq : 0, ibsAliq: porFora ? ibsAliq : 0, nota, teste,
      creditoCliente, custoClienteEmpresa: nota - creditoCliente, simples: sn, avisos
    };
  }

  function parcelas(valor, nParc, jurosMesPct) {
    const k = Math.max(1, Math.round(n(nParc))), j = n(jurosMesPct) / 100;
    const p = j > 0 ? valor * j / (1 - Math.pow(1 + j, -k)) : valor / k;
    return { parcela: p, total: p * k, n: k };
  }

  const api = { ANOS, SIMPLES, LIMITE_MEI, calcular, custoHora, simplesEfetiva, anexoAplicado, parcelas, num: n };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Calc = api;
})(this);
