// 작업실 라디오: 인터넷 없이 Web Audio로 그 자리에서 만드는 음악 (음악 파일이 없어서 저작권 걱정도 없다)
// main.js가 숨은 창에서 이 페이지를 띄우고 window.radio.set({ on, station, volume, mask })로 조절한다.
// 채널: lofi(로파이), piano(피아노), rain(빗소리), focus(집중 소음), cabin(비행기 안)
// mask(소음 가리기)는 채널이 아니라, 고른 채널 밑에 함께 깔리는 소리다
const ctx = new AudioContext({ latencyHint: 'playback' });
const out = ctx.createGain();
out.gain.value = 0;
const comp = ctx.createDynamicsCompressor();
comp.threshold.value = -16;
comp.knee.value = 12;
comp.ratio.value = 3;
comp.attack.value = 0.01;
comp.release.value = 0.25;
const analyser = ctx.createAnalyser();
analyser.fftSize = 2048;
out.connect(comp).connect(analyser).connect(ctx.destination);

const R = Math.random;
const pick = (a) => a[Math.floor(R() * a.length)];
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

// 공간감: 잔향 (무작위 소리가 서서히 줄어드는 응답)
function impulse(sec, decay) {
  const n = Math.floor(ctx.sampleRate * sec);
  const b = ctx.createBuffer(2, n, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = b.getChannelData(c);
    for (let i = 0; i < n; i++) d[i] = (R() * 2 - 1) * Math.pow(1 - i / n, decay);
  }
  return b;
}
const verb = ctx.createConvolver();
verb.buffer = impulse(3.2, 2.8);
const verbOut = ctx.createGain();
verbOut.gain.value = 0.8;
verb.connect(verbOut).connect(out);

// 소음: 흰 소음, 분홍 소음(조금 부드러움), 갈색 소음(낮고 묵직함)
function noise(sec, color) {
  const n = Math.floor(ctx.sampleRate * sec);
  const b = ctx.createBuffer(2, n, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = b.getChannelData(c);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
    for (let i = 0; i < n; i++) {
      const w = R() * 2 - 1;
      if (color === 'pink') {
        b0 = 0.99886 * b0 + w * 0.0555179;
        b1 = 0.99332 * b1 + w * 0.0750759;
        b2 = 0.969 * b2 + w * 0.153852;
        b3 = 0.8665 * b3 + w * 0.3104856;
        b4 = 0.55 * b4 + w * 0.5329522;
        b5 = -0.7616 * b5 - w * 0.016898;
        d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
        b6 = w * 0.115926;
      } else if (color === 'brown') {
        last = (last + 0.02 * w) / 1.02;
        d[i] = last * 3.5;
      } else d[i] = w;
    }
  }
  return b;
}
const WHITE = noise(2, 'white');
const PINK = noise(6, 'pink');
const BROWN = noise(6, 'brown');
function loop(buf, dest, gain) {
  const s = ctx.createBufferSource();
  s.buffer = buf;
  s.loop = true;
  s.loopStart = 0;
  s.loopEnd = buf.duration;
  const g = ctx.createGain();
  g.gain.value = gain;
  s.connect(g).connect(dest);
  s.start(ctx.currentTime, R() * buf.duration);
  return { src: s, gain: g };
}
function env(g, t, peak, attack, decayTo, decayTime, end) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
  if (decayTo != null) g.gain.exponentialRampToValueAtTime(Math.max(0.0001, decayTo), t + attack + decayTime);
  g.gain.exponentialRampToValueAtTime(0.0001, end);
}
function hit(buf, dest, t, { type, freq, q = 0.8, peak, len, rate = 1, pan = 0 }) {
  const s = ctx.createBufferSource();
  s.buffer = buf;
  s.playbackRate.value = rate;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = ctx.createGain();
  env(g, t, peak, 0.002, null, 0, t + len);
  let tail = g;
  if (pan) {
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    g.connect(p);
    tail = p;
  }
  s.connect(f).connect(g);
  tail.connect(dest);
  s.start(t, R() * (buf.duration - len - 0.05));
  s.stop(t + len + 0.05);
}

// ---------- 악기 ----------
// 따뜻한 전자 피아노 (FM: 처음엔 쇳소리가 살짝 났다가 둥글어진다)
function epiano(dest, m, t, dur, vel) {
  const f = mtof(m) * Math.pow(2, (R() - 0.5) * 0.006);
  const car = ctx.createOscillator();
  car.frequency.value = f;
  const mod = ctx.createOscillator();
  mod.frequency.value = f;
  const idx = ctx.createGain();
  idx.gain.setValueAtTime(f * 1.1, t);
  idx.gain.exponentialRampToValueAtTime(f * 0.06, t + 0.7);
  mod.connect(idx).connect(car.frequency);
  const g = ctx.createGain();
  env(g, t, vel, 0.008, vel * 0.32, 0.6, t + dur + 0.5);
  car.connect(g).connect(dest);
  car.start(t);
  mod.start(t);
  car.stop(t + dur + 0.6);
  mod.stop(t + dur + 0.6);
}
// 어쿠스틱 피아노 느낌 (배음 몇 개를 겹치고 빨리 밝기가 줄어든다)
function piano(dest, m, t, vel, len = 3.6) {
  const f = mtof(m);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(Math.min(9000, f * 9), t);
  lp.frequency.exponentialRampToValueAtTime(Math.max(500, f * 2.2), t + 1.3);
  const g = ctx.createGain();
  env(g, t, vel, 0.005, vel * 0.28, 0.4, t + len);
  for (const [k, a] of [[1, 1], [2, 0.45], [3, 0.2], [4, 0.1], [5, 0.05]]) {
    const o = ctx.createOscillator();
    o.frequency.value = f * k * (1 + 0.0006 * k * k);
    const pg = ctx.createGain();
    pg.gain.value = a / 1.8;
    o.connect(pg).connect(lp);
    o.start(t);
    o.stop(t + len + 0.1);
  }
  lp.connect(g).connect(dest);
}
function bass(dest, m, t, dur, vel = 0.3) {
  const o = ctx.createOscillator();
  o.type = 'triangle';
  o.frequency.value = mtof(m);
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = 280;
  const g = ctx.createGain();
  env(g, t, vel, 0.012, vel * 0.6, 0.3, t + dur);
  o.connect(f).connect(g).connect(dest);
  o.start(t);
  o.stop(t + dur + 0.05);
}
function kick(dest, t, vel) {
  const o = ctx.createOscillator();
  o.frequency.setValueAtTime(115, t);
  o.frequency.exponentialRampToValueAtTime(44, t + 0.13);
  const g = ctx.createGain();
  env(g, t, vel, 0.004, null, 0, t + 0.42);
  o.connect(g).connect(dest);
  o.start(t);
  o.stop(t + 0.45);
}
function snare(dest, t, vel) {
  hit(WHITE, dest, t, { type: 'bandpass', freq: 1700, q: 0.7, peak: vel * 0.55, len: 0.2 });
  const o = ctx.createOscillator();
  o.type = 'triangle';
  o.frequency.setValueAtTime(190, t);
  o.frequency.exponentialRampToValueAtTime(140, t + 0.08);
  const g = ctx.createGain();
  env(g, t, vel * 0.3, 0.003, null, 0, t + 0.1);
  o.connect(g).connect(dest);
  o.start(t);
  o.stop(t + 0.12);
}
function hat(dest, t, vel) {
  hit(WHITE, dest, t, { type: 'highpass', freq: 7600, q: 0.5, peak: vel, len: 0.045 });
}

// ---------- 채널 ----------
// 각 채널은 자기 볼륨(bus)을 갖고, 바꿀 때 서서히 겹쳐 넘어간다.
function makeBus() {
  const bus = ctx.createGain();
  bus.gain.value = 0;
  bus.connect(out);
  return bus;
}

function lofi() {
  const bus = makeBus();
  const warm = ctx.createBiquadFilter();
  warm.type = 'lowpass';
  warm.frequency.value = 2400;
  warm.Q.value = 0.3;
  warm.connect(bus);
  const send = ctx.createGain();
  send.gain.value = 0.22;
  warm.connect(send).connect(verb);
  const drums = ctx.createGain();
  drums.gain.value = 0.85;
  const drumTone = ctx.createBiquadFilter();
  drumTone.type = 'lowpass';
  drumTone.frequency.value = 6500;
  drums.connect(drumTone).connect(bus);
  // 레코드판 잡음
  const vin = ctx.createBiquadFilter();
  vin.type = 'bandpass';
  vin.frequency.value = 2600;
  vin.Q.value = 0.5;
  vin.connect(bus);
  const noiseBed = loop(PINK, vin, 0.05);
  // 리드 멜로디는 메아리를 조금
  const delay = ctx.createDelay(2);
  const fb = ctx.createGain();
  fb.gain.value = 0.28;
  delay.connect(fb).connect(delay);
  delay.connect(warm);

  const BPM = 72 + Math.floor(R() * 8);
  const beat = 60 / BPM;
  delay.delayTime.value = beat * 0.75;
  const PROGS = [
    [[50, 53, 57, 60, 64], [43, 53, 59, 64], [48, 52, 59, 62], [45, 55, 59, 60, 64]], // Dm9 G13 Cmaj9 Am9
    [[53, 57, 60, 64], [52, 55, 59, 62], [50, 53, 57, 60], [48, 52, 55, 59]], // Fmaj7 Em7 Dm7 Cmaj7
    [[45, 55, 60, 64], [50, 53, 57, 60], [43, 50, 53, 59], [48, 52, 55, 59, 62]], // Am7 Dm7 G7 Cmaj9
    [[53, 57, 60, 64, 67], [55, 59, 62, 65], [52, 55, 59, 62], [57, 60, 64, 67]], // Fmaj9 G7 Em7 Am7
  ];
  const PENTA = [72, 74, 76, 79, 81, 84];
  let prog = pick(PROGS);
  let next = ctx.currentTime + 0.15;
  let step = 0;
  let bar = 0;
  let crackleAt = ctx.currentTime;
  return {
    bus,
    stop() {
      try {
        noiseBed.src.stop();
      } catch {}
      setTimeout(() => bus.disconnect(), 200);
    },
    schedule(until) {
      // 레코드판 '틱' 소리
      while (crackleAt < until) {
        crackleAt += 0.08 + R() * 0.6;
        hit(WHITE, bus, crackleAt, { type: 'highpass', freq: 3000, q: 0.7, peak: 0.02 + R() * 0.03, len: 0.006, pan: R() * 1.4 - 0.7 });
      }
      while (next < until) {
        const s = step % 8;
        const t = next + (s % 2 ? beat * 0.5 * 0.18 : 0); // 엇박을 살짝 늦춰서 흔들리게
        const chord = prog[bar % 4];
        if (s === 0) {
          if (bar && bar % 8 === 0) prog = pick(PROGS);
          chord.forEach((m, i) => epiano(warm, m, t + i * 0.02 + R() * 0.012, beat * 3.4, 0.075 * (0.85 + R() * 0.3)));
          bass(bus, chord[0] - 12, t, beat * 1.7, 0.28);
        }
        if (s === 3 && R() < 0.45) chord.slice(1).forEach((m, i) => epiano(warm, m, t + i * 0.015, beat * 0.8, 0.045));
        if (s === 4) bass(bus, chord[0] - 12 + (R() < 0.3 ? 7 : 0), t, beat * 1.5, 0.24);
        if (s === 0 || (s === 5 && R() < 0.55) || (s === 3 && R() < 0.2)) kick(drums, t, 0.85);
        if (s === 2 || s === 6) snare(drums, t, 0.5 + R() * 0.1);
        hat(drums, t, s % 2 ? 0.05 + R() * 0.04 : 0.09 + R() * 0.04);
        if ((s === 1 || s === 5) && R() < 0.2) {
          const m = pick(PENTA);
          const o = ctx.createOscillator();
          o.type = 'triangle';
          o.frequency.value = mtof(m);
          const g = ctx.createGain();
          env(g, t, 0.05, 0.02, 0.02, 0.4, t + beat * 1.6);
          o.connect(g).connect(delay);
          g.connect(warm);
          o.start(t);
          o.stop(t + beat * 1.7);
        }
        next += beat / 2;
        step++;
        if (step % 8 === 0) bar++;
      }
    },
  };
}

function pianoStation() {
  const bus = makeBus();
  const tone = ctx.createGain();
  tone.gain.value = 1.9; // 다른 채널과 비슷한 크기로
  tone.connect(bus);
  const send = ctx.createGain();
  send.gain.value = 0.42;
  tone.connect(send).connect(verb);
  const PROGS = [
    [[48, 55, 59, 64], [45, 52, 55, 60], [41, 48, 52, 57], [43, 50, 53, 59]], // C Am F G
    [[41, 48, 52, 57], [43, 50, 55, 59], [40, 47, 50, 55], [45, 52, 55, 60]], // F G Em Am
    [[50, 53, 57, 60], [43, 50, 53, 59], [48, 52, 55, 59], [48, 52, 55, 59]], // Dm7 G7 Cmaj7 Cmaj7
  ];
  const beat = 60 / (60 + Math.floor(R() * 8));
  let prog = pick(PROGS);
  let next = ctx.currentTime + 0.2;
  let step = 0;
  let bar = 0;
  return {
    bus,
    stop() {
      setTimeout(() => bus.disconnect(), 200);
    },
    schedule(until) {
      while (next < until) {
        const s = step % 8;
        const chord = prog[bar % 4];
        const t = next + (R() - 0.5) * 0.02;
        if (s === 0) {
          if (bar && bar % 8 === 0) prog = pick(PROGS);
          piano(tone, chord[0] - 12, t, 0.16, 5);
          piano(tone, chord[0], t + 0.01, 0.07, 4);
        }
        // 화음을 위로 펼쳐 치기 (가끔 쉬기)
        if (s > 0 && R() < 0.78) {
          const up = [...chord.slice(1), chord[1] + 12, chord[2] + 12];
          const m = up[(s - 1) % up.length];
          piano(tone, m, t, 0.06 + R() * 0.035, 3.2);
        }
        // 가끔 높은 음으로 짧은 멜로디
        if ((s === 2 || s === 6) && R() < 0.3) piano(tone, chord[chord.length - 1] + 12 + pick([0, 2, 4, 7]), t + beat * 0.25, 0.05, 3);
        next += beat / 2;
        step++;
        if (step % 8 === 0) bar++;
      }
    },
  };
}

function rain() {
  const bus = makeBus();
  // 빗줄기: 분홍 소음을 걸러서
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 380;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 2600;
  hp.connect(lp).connect(bus);
  const sheet = loop(PINK, hp, 0.8);
  // 멀리서 웅웅거리는 소리
  const low = ctx.createBiquadFilter();
  low.type = 'lowpass';
  low.frequency.value = 260;
  low.connect(bus);
  const rumble = loop(BROWN, low, 0.55);
  // 빗줄기 세기가 천천히 바뀐다
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 0.05;
  const lfoG = ctx.createGain();
  lfoG.gain.value = 500;
  lfo.connect(lfoG).connect(lp.frequency);
  lfo.start();
  let dropAt = ctx.currentTime;
  return {
    bus,
    stop() {
      for (const s of [sheet.src, rumble.src, lfo]) {
        try {
          s.stop();
        } catch {}
      }
      setTimeout(() => bus.disconnect(), 200);
    },
    schedule(until) {
      // 창에 떨어지는 빗방울
      while (dropAt < until) {
        dropAt += 0.012 + R() * 0.07;
        hit(WHITE, bus, dropAt, { type: 'bandpass', freq: 1400 + R() * 4800, q: 4 + R() * 6, peak: 0.02 + R() * 0.05, len: 0.02 + R() * 0.05, pan: R() * 1.6 - 0.8 });
      }
    },
  };
}

function focus() {
  const bus = makeBus();
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 760;
  lp.connect(bus);
  const bed = loop(BROWN, lp, 0.7);
  const air = ctx.createBiquadFilter();
  air.type = 'bandpass';
  air.frequency.value = 1200;
  air.Q.value = 0.4;
  air.connect(bus);
  const hiss = loop(PINK, air, 0.05);
  // 아주 느리게 숨 쉬듯 커졌다 작아진다
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 0.07;
  const lfoG = ctx.createGain();
  lfoG.gain.value = 0.08;
  lfo.connect(lfoG).connect(bed.gain.gain);
  lfo.start();
  return {
    bus,
    stop() {
      for (const s of [bed.src, hiss.src, lfo]) {
        try {
          s.stop();
        } catch {}
      }
      setTimeout(() => bus.disconnect(), 200);
    },
    schedule() {},
  };
}

// 소음 가리기: 옆자리 말소리, 키보드 소리를 덮는 고른 소음 (마이크는 쓰지 않는다. 소리를 지우는 것이 아니라 덮는다)
// 채널과 따로 켜고 끈다. 켜 두면 로파이든 비행기 안이든 고른 채널 밑에 함께 깔린다
// 말소리가 몰린 음역(300~3000Hz)을 채우고, 크기가 출렁이면 덮는 힘이 약해지므로 일부러 변화 없이 고르게 낸다
function mask() {
  const bus = makeBus();
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 110;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 5200;
  lp.Q.value = 0.3;
  // 말소리 음역을 조금 도드라지게
  const voice = ctx.createBiquadFilter();
  voice.type = 'peaking';
  voice.frequency.value = 1100;
  voice.Q.value = 0.5;
  voice.gain.value = 4;
  hp.connect(voice).connect(lp).connect(bus);
  // 같은 소음 두 겹을 속도를 조금 다르게 틀어서, 6초마다 되풀이되는 티가 나지 않게 한다
  const a = loop(PINK, hp, 0.62);
  const b = loop(PINK, hp, 0.52);
  a.src.playbackRate.value = 0.94;
  b.src.playbackRate.value = 1.07;
  // 낮게 받쳐 주는 소리 (쉬익 소리만 나면 귀가 쉽게 피곤하다)
  const low = ctx.createBiquadFilter();
  low.type = 'lowpass';
  low.frequency.value = 420;
  low.connect(bus);
  const bed = loop(BROWN, low, 0.34);
  return {
    bus,
    stop() {
      for (const s of [a.src, b.src, bed.src]) {
        try {
          s.stop();
        } catch {}
      }
      setTimeout(() => bus.disconnect(), 200);
    },
    schedule() {},
  };
}

// 비행기 안: 낮게 깔리는 엔진 소리와 환기구 바람 소리 위로, 가끔 기내 방송 전의 '띵동'이 울린다
// 띵동은 종소리처럼 배음을 겹친 두 음(높은 음 → 낮은 음)이고, 기내 스피커처럼 살짝 좁게 걸러서 낸다
function cabin() {
  const bus = makeBus();
  // 엔진과 동체가 울리는 낮은 소리
  const low = ctx.createBiquadFilter();
  low.type = 'lowpass';
  low.frequency.value = 340;
  low.Q.value = 0.4;
  low.connect(bus);
  const rumble = loop(BROWN, low, 0.95);
  // 기내를 채우는 바람 소리 (중간 음역)
  const mid = ctx.createBiquadFilter();
  mid.type = 'bandpass';
  mid.frequency.value = 720;
  mid.Q.value = 0.35;
  mid.connect(bus);
  const air = loop(PINK, mid, 0.34);
  // 머리 위 환기구의 '쉬이' 소리
  const vent = ctx.createBiquadFilter();
  vent.type = 'highpass';
  vent.frequency.value = 2600;
  const ventLp = ctx.createBiquadFilter();
  ventLp.type = 'lowpass';
  ventLp.frequency.value = 6500;
  vent.connect(ventLp).connect(bus);
  const hiss = loop(PINK, vent, 0.075);
  // 엔진 회전음: 조금 어긋난 두 음이 천천히 울렁인다
  const hum = ctx.createGain();
  hum.gain.value = 0.05;
  const humLp = ctx.createBiquadFilter();
  humLp.type = 'lowpass';
  humLp.frequency.value = 260;
  hum.connect(humLp).connect(bus);
  const oscs = [[86, 'sine', 1], [86.7, 'sine', 0.8], [129.4, 'triangle', 0.35], [172.6, 'sine', 0.18]].map(([f, type, a]) => {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = f;
    const g = ctx.createGain();
    g.gain.value = a;
    o.connect(g).connect(hum);
    o.start();
    return o;
  });
  // 소리 세기가 아주 천천히 달라진다 (구름을 지날 때처럼)
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 0.045;
  const lfoG = ctx.createGain();
  lfoG.gain.value = 0.09;
  lfo.connect(lfoG).connect(rumble.gain.gain);
  lfo.start();
  // 기내 스피커: 좁게 걸러서 잔향을 조금
  const pa = ctx.createBiquadFilter();
  pa.type = 'bandpass';
  pa.frequency.value = 1500;
  pa.Q.value = 0.45;
  pa.connect(bus);
  const paSend = ctx.createGain();
  paSend.gain.value = 0.16;
  pa.connect(paSend).connect(verb);
  function ding(f, t, vel) {
    const g = ctx.createGain();
    env(g, t, vel, 0.004, vel * 0.42, 0.22, t + 2.4);
    for (const [k, a] of [[1, 1], [2, 0.34], [3.01, 0.13], [4.16, 0.07], [5.43, 0.03]]) {
      const o = ctx.createOscillator();
      o.frequency.value = f * k;
      const pg = ctx.createGain();
      pg.gain.setValueAtTime(a, t);
      pg.gain.exponentialRampToValueAtTime(a * (k > 1 ? 0.08 : 0.6), t + 1.2); // 높은 배음이 먼저 사라진다
      o.connect(pg).connect(g);
      o.start(t);
      o.stop(t + 2.5);
    }
    g.connect(pa);
  }
  let chimeAt = ctx.currentTime + 1.6; // 틀면 곧 한 번 울리고, 그 뒤로는 가끔
  return {
    bus,
    stop() {
      for (const s of [rumble.src, air.src, hiss.src, lfo, ...oscs]) {
        try {
          s.stop();
        } catch {}
      }
      setTimeout(() => bus.disconnect(), 200);
    },
    schedule(until) {
      while (chimeAt < until) {
        const t = chimeAt;
        if (R() < 0.75) {
          ding(659.26, t, 0.2); // 띵 (미)
          ding(523.25, t + 0.62, 0.2); // 동 (도)
        } else ding(587.33, t, 0.18); // 좌석 벨트 표시등: 한 번만
        chimeAt += 50 + R() * 70;
      }
    },
  };
}

const STATIONS = { lofi, piano: pianoStation, rain, focus, cabin };
// 소음 가리기 켜고 끄기 (채널과 따로 움직인다)
let maskNow = null;
function setMask(want) {
  const now = ctx.currentTime;
  if (want && !maskNow) {
    maskNow = mask();
    maskNow.bus.gain.setValueAtTime(0, now);
    maskNow.bus.gain.setTargetAtTime(0.85, now + 0.05, 0.5);
  } else if (!want && maskNow) {
    const old = maskNow;
    maskNow = null;
    old.bus.gain.cancelScheduledValues(now);
    old.bus.gain.setTargetAtTime(0, now, 0.3);
    setTimeout(() => old.stop(), 1600);
  }
}
let cur = null;
let curName = '';
let timer = null;
function tick() {
  if (cur) cur.schedule(ctx.currentTime + 1.2);
}
function switchTo(name) {
  if (name === curName && cur) return;
  const now = ctx.currentTime;
  if (cur) {
    const old = cur;
    old.bus.gain.cancelScheduledValues(now);
    old.bus.gain.setTargetAtTime(0, now, 0.4);
    setTimeout(() => old.stop(), 2000);
  }
  curName = name;
  cur = STATIONS[name]();
  cur.bus.gain.setValueAtTime(0, now);
  cur.bus.gain.setTargetAtTime(1, now + 0.05, 0.5);
  tick();
}
let on = false;
window.radio = {
  async set(s = {}) {
    const vol = Math.max(0, Math.min(1, Number(s.volume ?? 0.6)));
    const station = STATIONS[s.station] ? s.station : 'lofi';
    const now = ctx.currentTime;
    if (s.on) {
      if (ctx.state !== 'running') await ctx.resume();
      switchTo(station);
      setMask(!!s.mask);
      out.gain.cancelScheduledValues(now);
      out.gain.setTargetAtTime(vol * vol * 0.9, now, 0.25); // 귀에 고르게 들리게 제곱으로
      if (!timer) timer = setInterval(tick, 200);
      on = true;
    } else if (on) {
      on = false;
      out.gain.cancelScheduledValues(now);
      out.gain.setTargetAtTime(0, now, 0.25);
      setTimeout(() => {
        if (on) return;
        clearInterval(timer);
        timer = null;
        cur?.stop();
        cur = null;
        curName = '';
        maskNow?.stop();
        maskNow = null;
        ctx.suspend();
      }, 1500);
    }
    return { on, station: curName, mask: !!maskNow };
  },
  // 점검용: 지금 소리 크기 (평균과 최대)
  level() {
    const a = new Float32Array(analyser.fftSize);
    analyser.getFloatTimeDomainData(a);
    let sum = 0;
    let peak = 0;
    for (const v of a) {
      sum += v * v;
      peak = Math.max(peak, Math.abs(v));
    }
    return { rms: Math.sqrt(sum / a.length), peak, state: ctx.state, station: curName, mask: !!maskNow };
  },
};
