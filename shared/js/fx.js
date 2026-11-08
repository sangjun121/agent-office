// 종이 폭죽(색종이 조각)과 종이 총알
import * as THREE from 'three';

const PI = Math.PI;
const COLORS = ['#FF8A3D', '#FFD15C', '#3FA66B', '#3D6FD8', '#E5484D', '#8E6CCF', '#F6A6C1', '#7FD8BE', '#FFFFFF'];

export class FX {
  constructor(scene) {
    this.scene = scene;
    this.max = 900;
    this.paper = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(0.07, 0.04),
      new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, toneMapped: false }),
      this.max,
    );
    this.paper.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.paper.frustumCulled = false;
    this.paper.count = 0;
    this.paper.setColorAt(0, new THREE.Color('#ffffff'));
    scene.add(this.paper);
    this.parts = [];
    this.bullets = [];
    this.bulletGeo = new THREE.ConeGeometry(0.05, 0.17, 4);
    this.bulletGeo.rotateX(PI / 2);
    this.bulletMat = new THREE.MeshStandardMaterial({ color: '#FAFAF7', roughness: 0.6 });
    this.m4 = new THREE.Matrix4();
    this.q = new THREE.Quaternion();
    this.e = new THREE.Euler();
    this.v = new THREE.Vector3();
    this.s = new THREE.Vector3(1, 1, 1);
    this.c = new THREE.Color();
  }

  burst(x, y, z, n = 80) {
    for (let i = 0; i < n; i++) {
      if (this.parts.length >= this.max) this.parts.shift();
      const a = Math.random() * PI * 2;
      const sp = 1.2 + Math.random() * 2.4;
      this.parts.push({
        x,
        y,
        z,
        vx: Math.cos(a) * sp,
        vy: 2.5 + Math.random() * 3.5,
        vz: Math.sin(a) * sp,
        rx: Math.random() * PI,
        ry: Math.random() * PI,
        sx: (Math.random() - 0.5) * 14,
        sy: (Math.random() - 0.5) * 14,
        life: 2.2 + Math.random() * 1.2,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
      });
    }
  }

  shoot(x, y, z, h, owner) {
    const m = new THREE.Mesh(this.bulletGeo, this.bulletMat);
    m.castShadow = true;
    m.position.set(x, y, z);
    m.rotation.y = h;
    this.scene.add(m);
    this.bullets.push({ m, vx: Math.sin(h) * 9, vz: Math.cos(h) * 9, vy: 0.4, life: 1.3, owner, dead: false });
  }

  // blocked(x, z): 벽이나 가구에 막혔는지, hit(x, y, z, owner): 맞은 캐릭터
  update(dt, blocked, hit) {
    // 색종이
    let n = 0;
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.parts.splice(i, 1);
        continue;
      }
      if (p.y > 0.012) {
        p.vy -= 4.5 * dt;
        const drag = Math.exp(-2.2 * dt);
        p.vx *= drag;
        p.vz *= drag;
        p.vy = Math.max(p.vy, -1.6);
        p.x += p.vx * dt + Math.sin(p.life * 6) * 0.004;
        p.y += p.vy * dt;
        p.z += p.vz * dt;
        p.rx += p.sx * dt;
        p.ry += p.sy * dt;
        if (p.y <= 0.012) {
          p.y = 0.012;
          p.rx = -PI / 2;
          p.ry = 0;
        }
      }
    }
    for (const p of this.parts) {
      const k = Math.min(1, p.life / 0.4);
      this.e.set(p.rx, p.ry, 0);
      this.q.setFromEuler(this.e);
      this.s.set(k, k, k);
      this.m4.compose(this.v.set(p.x, p.y, p.z), this.q, this.s);
      this.paper.setMatrixAt(n, this.m4);
      this.paper.setColorAt(n, this.c.set(p.color));
      n++;
    }
    this.paper.count = n;
    this.paper.instanceMatrix.needsUpdate = true;
    if (this.paper.instanceColor) this.paper.instanceColor.needsUpdate = true;

    // 종이 총알
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      b.life -= dt;
      const m = b.m;
      if (!b.dead) {
        m.position.x += b.vx * dt;
        m.position.z += b.vz * dt;
        b.vy -= 1.2 * dt;
        m.position.y = Math.max(0.05, m.position.y + b.vy * dt);
        m.rotation.z += dt * 12;
        if (blocked(m.position.x, m.position.z)) {
          b.dead = true;
          b.life = Math.min(b.life, 0.6);
        } else {
          const who = hit(m.position.x, m.position.y, m.position.z, b.owner);
          if (who) {
            b.dead = true;
            b.life = Math.min(b.life, 0.25);
          }
        }
      } else {
        m.position.y = Math.max(0.03, m.position.y - dt * 1.5);
      }
      if (b.life <= 0) {
        this.scene.remove(m);
        this.bullets.splice(i, 1);
      }
    }
  }
}
