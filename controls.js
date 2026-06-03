const SLIDER_DEFS = [
  { group: '运动', items: [
    { key: 'count',    label: '数量',     min: 100,  max: 3000, step: 50 },
    { key: 'maxSpeed', label: '最大速度', min: 1,    max: 15,   step: 0.5 },
    { key: 'minSpeed', label: '最小速度', min: 0.5,  max: 8,    step: 0.5 },
    { key: 'maxForce', label: '转向力',   min: 0.01, max: 0.5,  step: 0.01 },
  ]},
  { group: '感知', items: [
    { key: 'perceptionRadius', label: '感知半径',   min: 20,  max: 200, step: 5 },
    { key: 'separationRadius', label: '分离半径',   min: 5,   max: 60,  step: 1 },
  ]},
  { group: '群集力', items: [
    { key: 'separationWeight',    label: '分离',     min: 0, max: 5, step: 0.1 },
    { key: 'alignmentWeight',     label: '对齐',     min: 0, max: 5, step: 0.1 },
    { key: 'cohesionWeight',      label: '聚合',     min: 0, max: 5, step: 0.1 },
    { key: 'globalCohesionWeight',label: '全局聚拢', min: 0, max: 5, step: 0.05 },
  ]},
  { group: '鼠标', items: [
    { key: 'mouseAttractionRadius', label: '吸引半径', min: 50,  max: 800, step: 10 },
    { key: 'mouseAttractionWeight', label: '吸引力',   min: 0,   max: 10,  step: 0.1 },
    { key: 'scatterRadius',         label: '驱散半径', min: 50,  max: 600, step: 10 },
    { key: 'scatterStrength',       label: '驱散力',   min: 1,   max: 30,  step: 0.5 },
    { key: 'idleTimeout',            label: '静止超时', min: 200, max: 5000, step: 100 },
  ]},
  { group: '传播', items: [
    { key: 'topologyK',        label: '邻居数',     min: 3,  max: 20, step: 1 },
    { key: 'mouseDirectRatio', label: '影响比例', min: 0.02,  max: 0.7, step: 0.02 },
  ]},
  { group: '深度', items: [
    { key: 'depthRange',  label: '深度范围', min: 50,  max: 500, step: 10 },
    { key: 'zEdgeFactor', label: 'Z回弹力',  min: 0.1, max: 3,   step: 0.1 },
  ]},
  { group: '边界', items: [
    { key: 'edgeMargin',     label: '边距',   min: 20, max: 300, step: 5 },
    { key: 'edgeTurnFactor', label: '回弹力', min: 0.1, max: 3, step: 0.1 },
  ]},
  { group: '拖尾', items: [
    { key: 'trailColor', label: '颜色', type: 'color' },
  ]},
  { group: '水波纹', items: [
    { key: 'rippleColor',    label: '颜色',     type: 'color' },
    { key: 'rippleAlpha',    label: '透明度',   min: 0.05, max: 1, step: 0.05 },
    { key: 'rippleWidth1',   label: '内环描边', min: 0.5, max: 50, step: 0.5 },
    { key: 'rippleWidth2',   label: '外环描边', min: 0.5, max: 50, step: 0.5 },
    { key: 'rippleSize',     label: '大小',     min: 30, max: 300, step: 10 },
    { key: 'rippleSpeed',    label: '扩散速度', min: 0.5, max: 3, step: 0.1 },
    { key: 'rippleDuration', label: '持续时间', min: 0.5, max: 4, step: 0.1 },
  ]},
  { group: '外观', items: [
    { key: 'boidSize',  label: '大小', min: 2,  max: 15, step: 0.5 },
    { key: 'boidWidth',  label: '宽度',     min: 1,  max: 10, step: 0.5 },
    { key: 'shadowBlur', label: '影子模糊', min: 0,  max: 10, step: 0.5 },
  ]},
];

export function createControls(params, callbacks) {
  const panel = document.createElement('div');
  panel.id = 'controls';
  panel.innerHTML = '<div class="ctrl-header"><span>参数调节</span><button id="ctrl-toggle">−</button></div><div id="ctrl-body"></div>';
  document.body.appendChild(panel);

  const body = panel.querySelector('#ctrl-body');
  const toggle = panel.querySelector('#ctrl-toggle');
  const defaults = { ...params };
  const sliders = {};

  for (const group of SLIDER_DEFS) {
    const section = document.createElement('div');
    section.className = 'ctrl-group';
    section.innerHTML = `<div class="ctrl-group-title">${group.group}</div>`;

    for (const item of group.items) {
      const row = document.createElement('div');
      row.className = 'ctrl-row';

      if (item.type === 'color') {
        const val = params[item.key];
        row.innerHTML = `
          <label>${item.label}</label>
          <input type="color" value="${val}" data-key="${item.key}" style="width:100%;height:24px;border:none;background:none;cursor:pointer;padding:0;">
          <span class="ctrl-val"></span>
        `;
        const input = row.querySelector('input');
        sliders[item.key] = { input, span: row.querySelector('.ctrl-val'), decimals: 0 };
        input.addEventListener('input', () => {
          params[item.key] = input.value;
        });
        section.appendChild(row);
        continue;
      }

      const val = params[item.key];
      const decimals = item.step < 1 ? (item.step < 0.1 ? 2 : 1) : 0;

      row.innerHTML = `
        <label>${item.label}</label>
        <input type="range" min="${item.min}" max="${item.max}" step="${item.step}" value="${val}" data-key="${item.key}">
        <span class="ctrl-val">${val.toFixed(decimals)}</span>
      `;

      const input = row.querySelector('input');
      const span = row.querySelector('.ctrl-val');
      sliders[item.key] = { input, span, decimals };

      input.addEventListener('input', () => {
        const v = parseFloat(input.value);
        params[item.key] = v;
        span.textContent = v.toFixed(decimals);

        if (item.key === 'count' && callbacks.onCountChange) {
          callbacks.onCountChange(v);
        }
        if (item.key === 'perceptionRadius' && callbacks.onPerceptionChange) {
          callbacks.onPerceptionChange(v);
        }
      });

      section.appendChild(row);
    }
    body.appendChild(section);
  }

  const btnRow = document.createElement('div');
  btnRow.className = 'ctrl-btns';
  btnRow.innerHTML = '<button id="ctrl-reset">重置</button><button id="ctrl-respawn">重生</button>';
  body.appendChild(btnRow);

  btnRow.querySelector('#ctrl-reset').addEventListener('click', () => {
    for (const [key, val] of Object.entries(defaults)) {
      if (typeof val === 'number' && sliders[key]) {
        params[key] = val;
        sliders[key].input.value = val;
        sliders[key].span.textContent = val.toFixed(sliders[key].decimals);
      }
    }
    if (callbacks.onCountChange) callbacks.onCountChange(params.count);
    if (callbacks.onPerceptionChange) callbacks.onPerceptionChange(params.perceptionRadius);
  });

  btnRow.querySelector('#ctrl-respawn').addEventListener('click', () => {
    if (callbacks.onRespawn) callbacks.onRespawn();
  });

  let collapsed = false;
  toggle.addEventListener('click', () => {
    collapsed = !collapsed;
    body.style.display = collapsed ? 'none' : '';
    toggle.textContent = collapsed ? '+' : '−';
  });

  panel.addEventListener('mousedown', (e) => e.stopPropagation());
  panel.addEventListener('mousemove', (e) => e.stopPropagation());
}
