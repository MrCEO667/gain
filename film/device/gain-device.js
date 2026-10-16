// The Gain device (chosen form, October 2026): a chamfered octagonal slab, 102 × 46 × 13.5 mm.
// A black DLC titanium band with a diamond-cut top chamfer; black zirconia top and back plates set flush into it.
// The top is clean: the fingerprint sensor sits hidden under the zirconia and shows only when touched, as the logo
// (ring, inner ring, dot) in white light. The button is a pressure-sensing end segment of the band. The light is white.
// makeBuild(overrides) also renders the smaller 72 × 40 × 11.5 mm study and the earlier dish/button variant.
// A black DLC titanium band with crisp polished chamfers; black zirconia top and back plates set flush into it.
// Units: mm. y is up and the object rests on y = 0. x = length (-x: button end, +x: lanyard end), z = width (+z: front, light slit).
// The body is one closed, merged mesh (material groups), so the volume readout is honest.

const BASE = {
  L: 102, W: 46, T: 13.5,        // envelope
  C: 7.0,                        // plan corner cut (45°, leg length)
  CTH: 1.2, CTV: 1.2,            // top chamfer: horizontal / vertical run
  CB: 0.7,                       // bottom chamfer
  // thumb dish (machined into the zirconia top plate) and the flush sapphire fingerprint sensor
  XD: -13.0, ZD: 0.0, RD: 8.8, RDC: 0.32, DCH: 0.22, DEPTH: 0.95, RSENS: 4.7, RRING: 0.5,
  // lanyard slot (through, top to bottom) at the +x end
  XS: 31.2, SHS: 5.4, SR: 1.2, SC: 0.32,
  // light slit on the front wall, button on the -x end wall
  SLIT: { len: 14, h: 0.6 }, BTN: { len: 8.2, h: 2.4, proud: 0.3 },
  DISH: false, BUTTON: false, SLOT: false, GLOW: 0xfff4e6,
};

export function makeBuild(over = {}) {
const P = { ...BASE, ...over };
return function build(ctx) {
  const { THREE, mats, BRAND_BLUE } = ctx;
  const { L, W, T, C, CTH, CTV, CB, XD, ZD, RD, RDC, DCH, DEPTH, RSENS, RRING, XS, SHS, SR, SC } = P;
  const a = L / 2, b = W / 2;

  // ------------------------------------------------------------------ materials
  const M = {
    bandSatin: new THREE.MeshPhysicalMaterial({ color: 0x3a3b40, metalness: 1, roughness: 0.58 }),         // bead-blasted black DLC titanium
    bandPolish: new THREE.MeshPhysicalMaterial({ color: 0x34353a, metalness: 1, roughness: 0.22 }),       // polished DLC (bottom chamfer)
    bandCut: new THREE.MeshPhysicalMaterial({ color: 0xa3a19c, metalness: 1, roughness: 0.3 }),           // diamond-cut top chamfer: bare titanium
    zirHoned: new THREE.MeshPhysicalMaterial({ color: 0x0a0a0b, metalness: 0, roughness: 0.5, ior: 1.6, specularIntensity: 0.8 }),
    zirPolish: new THREE.MeshPhysicalMaterial({ color: 0x08080a, metalness: 0, roughness: 0.2, ior: 1.6, specularIntensity: 0.9 }),
    slotWall: new THREE.MeshPhysicalMaterial({ color: 0x0b0b0c, metalness: 0.6, roughness: 0.6 }),
    zirDish: new THREE.MeshPhysicalMaterial({ color: 0x09090a, metalness: 0, roughness: 0.3, ior: 1.6, specularIntensity: 0.85 }),
  };
  const MAT = ['bandSatin', 'bandPolish', 'bandCut', 'zirHoned', 'zirPolish', 'slotWall', 'zirDish'];
  const mi = (k) => MAT.indexOf(k);

  // ------------------------------------------------------------------ tiny vector helpers
  const sub = (p, q) => [p[0] - q[0], p[1] - q[1], p[2] - q[2]];
  const cross = (p, q) => [p[1] * q[2] - p[2] * q[1], p[2] * q[0] - p[0] * q[2], p[0] * q[1] - p[1] * q[0]];
  const dot = (p, q) => p[0] * q[0] + p[1] * q[1] + p[2] * q[2];
  const norm = (p) => { const l = Math.hypot(p[0], p[1], p[2]) || 1; return [p[0] / l, p[1] / l, p[2] / l]; };

  // triangle soup with per-triangle material; each triangle is oriented to agree with a desired outward direction
  const soup = { pos: [], nor: [], mat: [] };
  function tri(A, B, Cc, mat, want, nA, nB, nC) {
    let n = cross(sub(B, A), sub(Cc, A));
    if (dot(n, want) < 0) { [B, Cc] = [Cc, B]; [nB, nC] = [nC, nB]; n = [-n[0], -n[1], -n[2]]; }
    n = norm(n);
    const fix = (v) => { if (!v) return n; return dot(v, n) < 0 ? [-v[0], -v[1], -v[2]] : v; };
    soup.pos.push(...A, ...B, ...Cc); soup.nor.push(...fix(nA), ...fix(nB), ...fix(nC)); soup.mat.push(mat);
  }
  // pull triangles out of a three.js geometry, mapping each vertex through f
  function fromGeometry(g, f, mat, wantFn, smooth) {
    const ng = g.index ? g.toNonIndexed() : g;
    const p = ng.attributes.position, nn = ng.attributes.normal;
    for (let i = 0; i < p.count; i += 3) {
      const v = [0, 1, 2].map((k) => f([p.getX(i + k), p.getY(i + k), p.getZ(i + k)]));
      const ns = smooth ? [0, 1, 2].map((k) => smooth([nn.getX(i + k), nn.getY(i + k), nn.getZ(i + k)])) : [null, null, null];
      const c = [(v[0][0] + v[1][0] + v[2][0]) / 3, (v[0][1] + v[1][1] + v[2][1]) / 3, (v[0][2] + v[1][2] + v[2][2]) / 3];
      tri(v[0], v[1], v[2], mat, wantFn(c), ns[0], ns[1], ns[2]);
    }
  }

  // ------------------------------------------------------------------ plan: chamfered octagon and its insets
  const oct = [[-a + C, -b], [a - C, -b], [a, -b + C], [a, b - C], [a - C, b], [-a + C, b], [-a, b - C], [-a, -b + C]];
  function inset(poly, d) {
    const n = poly.length, lines = [];
    for (let i = 0; i < n; i++) {
      const p = poly[i], q = poly[(i + 1) % n];
      let dx = q[0] - p[0], dz = q[1] - p[1]; const l = Math.hypot(dx, dz); dx /= l; dz /= l;
      let nx = dz, nz = -dx;
      if (nx * (p[0] + q[0]) + nz * (p[1] + q[1]) < 0) { nx = -nx; nz = -nz; }
      lines.push({ px: p[0] - nx * d, pz: p[1] - nz * d, dx, dz, nx, nz });
    }
    const out = [];
    for (let i = 0; i < n; i++) {
      const A = lines[(i - 1 + n) % n], B = lines[i];
      const det = -A.dx * B.dz + A.dz * B.dx;
      const rx = B.px - A.px, rz = B.pz - A.pz;
      const s = (-rx * B.dz + rz * B.dx) / det;
      out.push([A.px + s * A.dx, A.pz + s * A.dz]);
    }
    out.lines = lines;
    return out;
  }
  const stadium = (cx, cz, hs, r, n = 28) => {
    const pts = [];
    for (let i = 0; i <= n; i++) { const t = (Math.PI * i) / n; pts.push([cx + r * Math.cos(t), cz + hs + r * Math.sin(t)]); }
    for (let i = 0; i <= n; i++) { const t = Math.PI + (Math.PI * i) / n; pts.push([cx + r * Math.cos(t), cz - hs + r * Math.sin(t)]); }
    return pts;
  };

  // ------------------------------------------------------------------ band: lofted profile around the octagon (flat facets)
  const prof = [
    { d: CB, y: 0 },
    { d: 0, y: CB, m: 'bandPolish' },        // bottom chamfer
    { d: 0, y: T - CTV, m: 'bandSatin' },    // wall
    { d: CTH, y: T, m: 'bandCut' },          // top chamfer: diamond-cut, bare titanium
  ];
  const rings = prof.map((p) => inset(oct, p.d).map(([x, z]) => [x, p.y, z]));
  const mid = [0, T / 2, 0];
  for (let k = 0; k < prof.length - 1; k++) {
    const r0 = rings[k], r1 = rings[k + 1], m = mi(prof[k + 1].m);
    for (let i = 0; i < r0.length; i++) {
      const j = (i + 1) % r0.length;
      const want = sub([(r0[i][0] + r1[j][0]) / 2, (r0[i][1] + r1[j][1]) / 2, (r0[i][2] + r1[j][2]) / 2], mid);
      tri(r0[i], r0[j], r1[j], m, want); tri(r0[i], r1[j], r1[i], m, want);
    }
  }

  // ------------------------------------------------------------------ top plate (zirconia) with the dish and slot openings
  const RDO = RD + RDC;                  // dish rim (outer edge of its polished chamfer)
  const toShape = (pts) => pts.map(([x, z]) => new THREE.Vector2(x, z));
  const topOuter = inset(oct, CTH);
  const topShape = new THREE.Shape(toShape(topOuter));
  if (P.DISH) { const dishHole = new THREE.Path(); dishHole.absarc(XD, ZD, RDO, 0, Math.PI * 2, false); topShape.holes.push(dishHole); }
  if (P.SLOT) topShape.holes.push(new THREE.Path(toShape(stadium(XS, 0, SHS, SR + SC))));
  fromGeometry(new THREE.ShapeGeometry(topShape, 160), ([u, v]) => [u, T, v], mi('zirHoned'), () => [0, 1, 0]);

  // back plate (zirconia), slot opening
  const botShape = new THREE.Shape(toShape(inset(oct, CB)));
  if (P.SLOT) botShape.holes.push(new THREE.Path(toShape(stadium(XS, 0, SHS, SR + SC))));
  fromGeometry(new THREE.ShapeGeometry(botShape, 32), ([u, v]) => [u, 0, v], mi('zirHoned'), () => [0, -1, 0]);

  // ------------------------------------------------------------------ thumb dish: polished rim chamfer + spherical cap
  const capH = DEPTH - DCH;                                  // sagitta of the spherical part
  const RS = (RD * RD + capH * capH) / (2 * capH);           // sphere radius
  const yc = T - DEPTH + RS;                                 // sphere centre height
  const capY = (r) => yc - Math.sqrt(RS * RS - r * r);
  const SEG = 192;
  const dishWant = (c) => norm([XD - c[0], yc - c[1], ZD - c[2]]);   // toward the sphere centre (out of the material)
  const lathe = (pts) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), SEG);
  const shift = ([x, y, z]) => [x + XD, y, z + ZD];
  if (P.DISH) {
    fromGeometry(lathe([[RDO, T], [RD, T - DCH]]), shift, mi('zirPolish'), dishWant, (n) => n);
    const capPts = []; for (let i = 0; i <= 40; i++) { const r = RD * (1 - i / 40); capPts.push([r, capY(r)]); }
    fromGeometry(lathe(capPts), shift, mi('zirDish'), dishWant, (n) => n);
  }

  // ------------------------------------------------------------------ lanyard slot: through-hole with chamfered lips
  const sring = (d, y) => stadium(XS, 0, SHS, SR + d).map(([x, z]) => [x, y, z]);
  const srings = [sring(SC, T), sring(0, T - SC), sring(0, SC), sring(SC, 0)];
  const smat = [mi('bandCut'), mi('slotWall'), mi('bandPolish')];
  for (let k = 0; k < (P.SLOT ? 3 : 0); k++) {
    const r0 = srings[k], r1 = srings[k + 1];
    for (let i = 0; i < r0.length; i++) {
      const j = (i + 1) % r0.length;
      const c = [(r0[i][0] + r1[j][0]) / 2, (r0[i][1] + r1[j][1]) / 2, (r0[i][2] + r1[j][2]) / 2];
      // into the hole: toward the slot's centre line, plus up/down on the lips
      const zc = Math.max(-SHS, Math.min(SHS, c[2]));
      const want = [XS - c[0], k === 0 ? 1 : k === 2 ? -1 : 0, zc - c[2]];
      tri(r0[i], r0[j], r1[j], smat[k], want); tri(r0[i], r1[j], r1[i], smat[k], want);
    }
  }

  // ------------------------------------------------------------------ assemble the body (one closed mesh, material groups)
  const order = [];
  for (let t = 0; t < soup.mat.length; t++) order.push(t);
  order.sort((p, q) => soup.mat[p] - soup.mat[q]);
  const pos = new Float32Array(soup.pos.length), nor = new Float32Array(soup.nor.length);
  const geo = new THREE.BufferGeometry();
  let start = 0;
  order.forEach((t, k) => {
    for (let s = 0; s < 9; s++) { pos[k * 9 + s] = soup.pos[t * 9 + s]; nor[k * 9 + s] = soup.nor[t * 9 + s]; }
    const nextMat = k + 1 < order.length ? soup.mat[order[k + 1]] : -1;
    if (nextMat !== soup.mat[t]) { geo.addGroup(start * 3, (k + 1 - start) * 3, soup.mat[t]); start = k + 1; }
  });
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  const group = new THREE.Group();
  const body = new THREE.Mesh(geo, MAT.map((k) => M[k]));
  group.add(body);

  const deco = (mesh) => { mesh.userData.noVolume = true; group.add(mesh); return mesh; };

  // ------------------------------------------------------------------ sapphire sensor + polished titanium ring, flush in the dish
  // sapphire over a dark-inked sensor: a honed-looking base under a glossy layer, so it reads as glass, not as a lens
  const sapphire = new THREE.MeshPhysicalMaterial({ color: 0x0d0e11, metalness: 0, roughness: 0.32, ior: 1.6, specularIntensity: 0.7, clearcoat: 0.5, clearcoatRoughness: 0.18 });
  const ringMat = new THREE.MeshPhysicalMaterial({ color: 0x9a9893, metalness: 1, roughness: 0.26 });
  const capDisc = (r0, r1, lift, n = 24) => {
    const pts = []; for (let i = 0; i <= n; i++) { const r = r1 + (r0 - r1) * (i / n); pts.push(new THREE.Vector2(Math.max(r, 1e-4), capY(r) + lift)); }
    const g = new THREE.LatheGeometry(pts, SEG); g.translate(XD, 0, ZD); return g;
  };
  // LatheGeometry normals follow profile order; build from rim to centre so the faces look up
  if (P.DISH) {
    const sens = deco(new THREE.Mesh(capDisc(0, RSENS, 0.02), sapphire));
    const ring = deco(new THREE.Mesh(capDisc(RSENS, RSENS + RRING, 0.025, 2), ringMat));
    for (const m of [sens, ring]) { m.material.side = THREE.DoubleSide; }
  }

  // hairline where the zirconia plate meets the band's top chamfer
  const gapMat = new THREE.MeshBasicMaterial({ color: 0x020203 });
  {
    const o = inset(oct, CTH), i2 = inset(oct, CTH + 0.12);
    const s = new THREE.Shape(toShape(o)); s.holes.push(new THREE.Path(toShape(i2)));
    const g = new THREE.ShapeGeometry(s); g.rotateX(Math.PI / 2); g.translate(0, T + 0.006, 0);
    // rotateX(+90°) maps shape (u, v) to (u, 0, v)
    deco(new THREE.Mesh(g, gapMat)).material.side = THREE.DoubleSide;
  }

  // ------------------------------------------------------------------ antenna breaks: polymer hairlines across the four corner facets
  const polymer = new THREE.MeshBasicMaterial({ color: 0x050506, side: THREE.DoubleSide });
  for (const e of [1, 3, 5, 7]) {
    const pos2 = [];
    for (const p of prof) {
      const poly = inset(oct, p.d), ln = poly.lines[e];
      const A = poly[e], B = poly[(e + 1) % poly.length];
      const mx = (A[0] + B[0]) / 2 + ln.nx * 0.02, mz = (A[1] + B[1]) / 2 + ln.nz * 0.02;
      pos2.push([mx - ln.dx * 0.2, p.y, mz - ln.dz * 0.2], [mx + ln.dx * 0.2, p.y, mz + ln.dz * 0.2]);
    }
    const arr = [];
    for (let k = 0; k < prof.length - 1; k++) { const [p0, p1] = [pos2[2 * k], pos2[2 * k + 1]], [q0, q1] = [pos2[2 * k + 2], pos2[2 * k + 3]]; arr.push(...p0, ...p1, ...q1, ...p0, ...q1, ...q0); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3)); g.computeVertexNormals();
    deco(new THREE.Mesh(g, polymer));
  }

  // ------------------------------------------------------------------ light slit (front wall, centred): brand blue light pipe in a dark recess
  const wallMidY = (CB + T - CTV) / 2;
  const recess = deco(new THREE.Mesh(new THREE.PlaneGeometry(P.SLIT.len + 0.8, P.SLIT.h + 0.5), mats.port));
  recess.position.set(0, wallMidY, b + 0.01);
  const ledMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(P.GLOW).multiplyScalar(1.5) });
  const led = deco(new THREE.Mesh(new THREE.PlaneGeometry(P.SLIT.len, P.SLIT.h), ledMat));
  led.position.set(0, wallMidY, b + 0.02);
  const slitParts = [{ mesh: led, base: ledMat.color.clone() }];
  // the glow: a soft additive halo on the satin wall around the slit (bloom alone turns bright blue white)
  {
    const TW = 128, TH = 32, data = new Uint8Array(TW * TH * 4);
    for (let j = 0; j < TH; j++) for (let i = 0; i < TW; i++) {
      const u = (i + 0.5) / TW * 2 - 1, v = (j + 0.5) / TH * 2 - 1;
      const dx = Math.max(0, Math.abs(u) - 0.5) / 0.5, dy = Math.abs(v);
      const k = Math.exp(-(dx * dx) * 5 - (dy * dy) * 6) * (1 - Math.max(Math.abs(u), Math.abs(v)) ** 6);
      const o = 4 * (j * TW + i); data[o] = data[o + 1] = data[o + 2] = Math.round(255 * Math.max(0, k)); data[o + 3] = 255;
    }
    const tex = new THREE.DataTexture(data, TW, TH); tex.needsUpdate = true; tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearFilter;
    const haloMat = new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(P.GLOW).multiplyScalar(0.28), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    const halo = deco(new THREE.Mesh(new THREE.PlaneGeometry(P.SLIT.len * 1.7, 4.2), haloMat));
    halo.position.set(0, wallMidY, b + 0.03); halo.renderOrder = 3;
    slitParts.push({ mesh: halo, base: haloMat.color.clone() });
  }

  // ------------------------------------------------------------------ the one button: a flush pill on the -x end wall
  const pill = (len, h) => {
    const s = new THREE.Shape(), r = h / 2, hl = len / 2 - r;
    s.moveTo(-hl, -r); s.lineTo(hl, -r); s.absarc(hl, 0, r, -Math.PI / 2, Math.PI / 2, false); s.lineTo(-hl, r); s.absarc(-hl, 0, r, Math.PI / 2, Math.PI * 1.5, false);
    return s;
  };
  if (P.BUTTON) {
    const gap = deco(new THREE.Mesh(new THREE.ShapeGeometry(pill(P.BTN.len + 0.5, P.BTN.h + 0.5), 24), mats.port));
    gap.rotation.y = -Math.PI / 2; gap.position.set(-a - 0.01, wallMidY, 0);
    const bg = new THREE.ExtrudeGeometry(pill(P.BTN.len - 0.24, P.BTN.h - 0.24), { depth: P.BTN.proud - 0.12, bevelEnabled: true, bevelThickness: 0.12, bevelSize: 0.12, bevelSegments: 2, curveSegments: 24 });
    bg.translate(0, 0, 0.12);   // local z from 0 to proud
    const btn = deco(new THREE.Mesh(bg, [M.bandSatin, M.bandCut]));   // satin face, diamond-cut edge
    btn.rotation.y = -Math.PI / 2; btn.position.set(-a, wallMidY, 0);
  }

  // ------------------------------------------------------------------ microphones: three micro-perforated ports on the back top chamfer
  {
    const n = norm([0, CTH, -CTV]);
    const hole = new THREE.CircleGeometry(0.2, 16);
    for (const xc of [-16, 0, 16]) for (const dx of [-0.55, 0, 0.55]) {
      const m = deco(new THREE.Mesh(hole, mats.port));
      const p = [xc + dx, T - CTV / 2 + n[1] * 0.015, -b + CTH / 2 + n[2] * 0.015];
      m.position.set(...p); m.lookAt(p[0] + n[0], p[1] + n[1], p[2] + n[2]);
    }
  }

  // ------------------------------------------------------------------ USB-C on the back wall
  {
    const usb = deco(new THREE.Mesh(new THREE.ShapeGeometry(pill(8.4, 2.6), 16), mats.port));
    usb.rotation.y = Math.PI; usb.position.set(0, wallMidY, -b - 0.01);
  }

  // ------------------------------------------------------------------ beauty view only: a raking key placed at the mirror of the camera about
  // the front chamfer, so the chamfers draw the object in light while every face stays in shadow (no bright face = no bloom patch)
  let view = '';
  try { view = new URLSearchParams(globalThis.location ? globalThis.location.search : '').get('view') || ''; } catch { view = ''; }
  if (view === 'beauty') {
    for (const k of MAT) M[k].envMapIntensity = 0.45;
    // intensity kept so the chamfer's GGX peak stays below the bloom threshold
    const key = new THREE.PointLight(0xffffff, 0.3, 0, 0);
    key.position.set(-68, 100, 12); group.add(key);
  }

  // ------------------------------------------------------------------ hidden fingerprint sensor: invisible under the zirconia until touched,
  // then the logo appears in white light through the ceramic (outer ring, fainter inner ring, centre dot). Only in the 'touch' view.
  const touchParts = [];
  if (!P.DISH) {
    const glow = (r0, r1, k) => {
      const g = new THREE.RingGeometry(Math.max(r0, 0.0001), r1, 160); g.rotateX(-Math.PI / 2); g.translate(XD, T + 0.012, ZD);
      const m = deco(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: new THREE.Color(P.GLOW).multiplyScalar(k), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })));
      m.renderOrder = 4; touchParts.push({ mesh: m, base: m.material.color.clone() }); return m;
    };
    const R = P.RSENS + 1.6;
    // soft light bleeding through the ceramic around the rings
    {
      const TS = 128, data = new Uint8Array(TS * TS * 4);
      for (let j = 0; j < TS; j++) for (let i = 0; i < TS; i++) {
        const u = (i + 0.5) / TS * 2 - 1, v = (j + 0.5) / TS * 2 - 1, r = Math.hypot(u, v);
        const k = Math.exp(-((r - 0.55) ** 2) * 26) * 0.9 + Math.exp(-(r * r) * 30) * 0.35;
        const o = 4 * (j * TS + i); data[o] = data[o + 1] = data[o + 2] = Math.round(255 * Math.min(1, k) * (r < 1 ? 1 : 0)); data[o + 3] = 255;
      }
      const tex = new THREE.DataTexture(data, TS, TS); tex.needsUpdate = true; tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearFilter;
      const g = new THREE.PlaneGeometry(R * 3.6, R * 3.6); g.rotateX(-Math.PI / 2); g.translate(XD, T + 0.008, ZD);
      const m = deco(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(P.GLOW).multiplyScalar(0.22), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })));
      m.renderOrder = 3; touchParts.push({ mesh: m, base: m.material.color.clone() });
    }
    glow(R - 0.22, R + 0.22, 1.25);
    glow(R * 0.47 - 0.16, R * 0.47 + 0.16, 0.7);
    glow(0, R * 0.15, 1.1);
  }

  // Animation handles: k in [0, 1] scales the light. setTouch(1) shows the logo through the ceramic; setSlit(0) turns the slit off.
  const scaleLight = (parts, k) => { for (const p of parts) { p.mesh.visible = k > 0.001; p.mesh.material.color.copy(p.base).multiplyScalar(k); } };
  const anim = { setTouch: (k) => scaleLight(touchParts, k), setSlit: (k) => scaleLight(slitParts, k), materials: M };
  anim.setTouch(view === 'touch' ? 1 : 0);

  const s = L / 72;
  return {
    anim,
    object: group,
    dims: [L, T, W],
    focus: P.DISH ? [XD, T - DEPTH * 0.5, ZD] : [0, (CB + T - CTV) / 2, b],
    views: [
      { name: 'beauty', cam: [118 * s, 24 * s, 178 * s], target: [-2 * s, 4, 0], fov: 17 },
      { name: 'touch', cam: [XD - 34 * s, T + 78 * s, 74 * s], target: [XD + 8 * s, T, 2], fov: 24 },
      { name: 'end', cam: [-150 * s, 30, 40 * s], target: [-36 * s, 6, 0], fov: 12 },
    ],
  };
};
}

export default makeBuild();
