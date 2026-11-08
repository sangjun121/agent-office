// 따라가기용 격자 길찾기 (A*)
export class Grid {
  constructor(W, D, colliders, cell = 0.5, pad = 0.3) {
    this.cell = cell;
    this.nx = Math.ceil(W / cell);
    this.nz = Math.ceil(D / cell);
    this.block = new Uint8Array(this.nx * this.nz);
    for (let iz = 0; iz < this.nz; iz++)
      for (let ix = 0; ix < this.nx; ix++) {
        const x = (ix + 0.5) * cell;
        const z = (iz + 0.5) * cell;
        let b = x < pad || z < pad || x > W - pad || z > D - pad;
        if (!b)
          for (const c of colliders)
            if (x > c.x0 - pad && x < c.x1 + pad && z > c.z0 - pad && z < c.z1 + pad) {
              b = true;
              break;
            }
        this.block[iz * this.nx + ix] = b ? 1 : 0;
      }
  }

  idx(x, z) {
    const ix = Math.min(this.nx - 1, Math.max(0, Math.floor(x / this.cell)));
    const iz = Math.min(this.nz - 1, Math.max(0, Math.floor(z / this.cell)));
    return iz * this.nx + ix;
  }

  center(i) {
    return { x: ((i % this.nx) + 0.5) * this.cell, z: (Math.floor(i / this.nx) + 0.5) * this.cell };
  }

  nearestFree(i) {
    if (!this.block[i]) return i;
    const cx = i % this.nx;
    const cz = Math.floor(i / this.nx);
    for (let r = 1; r < 8; r++)
      for (let dz = -r; dz <= r; dz++)
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
          const x = cx + dx;
          const z = cz + dz;
          if (x < 0 || z < 0 || x >= this.nx || z >= this.nz) continue;
          const j = z * this.nx + x;
          if (!this.block[j]) return j;
        }
    return -1;
  }

  free(i) {
    return i >= 0 && !this.block[i];
  }

  // 두 점 사이가 뚫려 있는지
  clear(ax, az, bx, bz) {
    const d = Math.hypot(bx - ax, bz - az);
    const n = Math.ceil(d / (this.cell * 0.4));
    for (let k = 1; k < n; k++) {
      const t = k / n;
      if (this.block[this.idx(ax + (bx - ax) * t, az + (bz - az) * t)]) return false;
    }
    return true;
  }

  find(sx, sz, gx, gz) {
    const s = this.nearestFree(this.idx(sx, sz));
    const g = this.nearestFree(this.idx(gx, gz));
    if (s < 0 || g < 0) return null;
    if (s === g) return [];
    const N = this.nx * this.nz;
    const gScore = new Float32Array(N).fill(Infinity);
    const fScore = new Float32Array(N).fill(Infinity);
    const prev = new Int32Array(N).fill(-1);
    const closed = new Uint8Array(N);
    const open = [s];
    const gx0 = g % this.nx;
    const gz0 = Math.floor(g / this.nx);
    const hfn = (i) => {
      const dx = Math.abs((i % this.nx) - gx0);
      const dz = Math.abs(Math.floor(i / this.nx) - gz0);
      return Math.max(dx, dz) + 0.414 * Math.min(dx, dz);
    };
    gScore[s] = 0;
    fScore[s] = hfn(s);
    while (open.length) {
      let bi = 0;
      for (let k = 1; k < open.length; k++) if (fScore[open[k]] < fScore[open[bi]]) bi = k;
      const cur = open[bi];
      open.splice(bi, 1);
      if (cur === g) break;
      closed[cur] = 1;
      const cx = cur % this.nx;
      const cz = Math.floor(cur / this.nx);
      for (let dz = -1; dz <= 1; dz++)
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dz) continue;
          const x = cx + dx;
          const z = cz + dz;
          if (x < 0 || z < 0 || x >= this.nx || z >= this.nz) continue;
          const j = z * this.nx + x;
          if (this.block[j] || closed[j]) continue;
          if (dx && dz && (this.block[cz * this.nx + x] || this.block[z * this.nx + cx])) continue;
          const ng = gScore[cur] + (dx && dz ? 1.414 : 1);
          if (ng < gScore[j]) {
            if (gScore[j] === Infinity) open.push(j);
            gScore[j] = ng;
            fScore[j] = ng + hfn(j);
            prev[j] = cur;
          }
        }
    }
    if (prev[g] === -1) return null;
    const cells = [];
    for (let c = g; c !== s; c = prev[c]) cells.push(c);
    cells.reverse();
    // 보이는 곳까지는 건너뛰어 길을 매끄럽게
    const pts = cells.map((c) => this.center(c));
    const out = [];
    let ax = sx;
    let az = sz;
    let k = 0;
    while (k < pts.length) {
      let far = k;
      for (let m = pts.length - 1; m > k; m--)
        if (this.clear(ax, az, pts[m].x, pts[m].z)) {
          far = m;
          break;
        }
      out.push(pts[far]);
      ax = pts[far].x;
      az = pts[far].z;
      k = far + 1;
    }
    return out;
  }
}
