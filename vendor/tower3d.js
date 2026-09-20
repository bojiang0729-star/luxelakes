/* ARCANE RISE · 全组团 3D 楼栋查看器
   外立面：斜向香槟金渐变（#F9E7C9→#E1BB8F→#CDA476）+ 轻细颗粒/拉丝纹理
   四栋塔楼、顺序与外形参考图2：A/B 方正塔 · C 庭院塔 · D 双拱冠塔 */
(function () {
  var o, canvas, info, tip, closeBtn, host;
  var renderer, scene, camera, controls, group, tower = null, baseRing, keyLight, sunBall;
  var meshes = [], sel = null, hov = null;
  var ray, ptr, enter = null, running = false, ready = false;
  var gradTex = null, brushTex = null;
  var FH = 3.2, BH = 6.8, drop = 420;
  /* 户型俯瞰：左右户展示模型、相机缓动、当前视图(0=全景 -1=左户 1=右户) */
  var unitL = null, unitR = null, camAnim = null, curUnit = 0;
  var sunH = 12, sunPlaying = true, sunCur = 12;   // 日照时刻 6–18 / 是否自动播放 / 循环时当前时刻

  /* 太阳轨迹参数：方位角、高度角、强度、色温随时间变化（6:00 朝湖 → 14:00 南向 → 18:00）
     方位角 az：0°=南(+Z)，-90°=东(+X)，+90°=西(-X)；仰角 el：0°=地平线 90°=天顶 */
  var SUN_TRACK = {
    6:  { az: -67, el: 4,  i: 0.30, c: 0xff8f5a },  // 清晨：低角度日照，朝湖/东侧，暖橙
    7:  { az: -55, el: 12, i: 0.52, c: 0xffb073 },
    8:  { az: -42, el: 22, i: 0.72, c: 0xffcf9a },
    9:  { az: -28, el: 32, i: 0.90, c: 0xffe8c8 },  // 上午：东北高日照
    10: { az: -16, el: 42, i: 1.00, c: 0xfff4e2 },
    11: { az: -6,  el: 52, i: 1.04, c: 0xfffbf0 },
    12: { az: 0,   el: 58, i: 1.08, c: 0xffffff },  // 正午：天际线附近，白亮
    13: { az: 6,   el: 52, i: 1.04, c: 0xfffbf0 },
    14: { az: 16,  el: 42, i: 1.00, c: 0xfff4e2 },  // 下午：南向阳台日照
    15: { az: 28,  el: 32, i: 0.90, c: 0xffe8c8 },
    16: { az: 42,  el: 22, i: 0.72, c: 0xffcf9a },
    17: { az: 55,  el: 12, i: 0.52, c: 0xffb073 },
    18: { az: 67,  el: 4,  i: 0.30, c: 0xff8f5a }   // 傍晚：低角度日照，南向长影，暖橙
  };

  var CHAMP = 0xd8bd9a;   // 暖金玻璃
  var DARK = 0x25282a;    // 深色结构肋
  var BAND = 0xe9d4ba;    // 层间暖金镶边

  /* 四栋互动主塔（楼盘主体 5-1 号楼组团）：西北岸高层板块，放大尺寸以匹配大沙盘 */
  var TOWERS = [
    { id: '1', name: '1栋',  x: -348, z: -400, style: 'block',   floors: 52, w: 27, d: 25, glass: 0xd8bd9a },
    { id: '2', name: '2栋',  x: -266, z: -350, style: 'block',   floors: 44, w: 26, d: 24, glass: 0xd8bd9a },
    { id: '3', name: '3栋',  x: -198, z: -424, style: 'court',   floors: 40, w: 25, d: 23, glass: 0xc8a780 },
    { id: '4', name: '4栋',  x: -302, z: -284, style: 'arch',    floors: 48, w: 26, d: 24, glass: 0xae8b66 }
  ];

  /* 5-1 号楼逐层户型表：每层两户 [房号1, 面积1, 房号2, 面积2]，1F 为架空层 */
  var FLOOR_UNITS = {
    2:  ['5-1-201', 208.03, '5-1-202', 207.21],
    3:  ['5-1-301', 207.21, '5-1-302', 208.03],
    4:  ['5-1-401', 208.03, '5-1-402', 207.21],
    5:  ['5-1-501', 207.21, '5-1-502', 208.03],
    6:  ['5-1-601', 208.03, '5-1-602', 207.21],
    7:  ['5-1-701', 207.21, '5-1-702', 208.03],
    8:  ['5-1-801', 208.03, '5-1-802', 207.21],
    9:  ['5-1-901', 207.21, '5-1-902', 208.03],
    10: ['5-1-1001', 208.03, '5-1-1002', 207.21],
    11: ['5-1-1101', 207.21, '5-1-1102', 209.42],
    12: ['5-1-1201', 208.26, '5-1-1202', 207.21],
    13: ['5-1-1301', 207.21, '5-1-1302', 209.42],
    14: ['5-1-1401', 208.26, '5-1-1402', 207.21],
    15: ['5-1-1501', 207.21, '5-1-1502', 209.42],
    16: ['5-1-1601', 208.26, '5-1-1602', 207.21],
    17: ['5-1-1701', 207.21, '5-1-1702', 209.42],
    18: ['5-1-1801', 208.26, '5-1-1802', 207.21],
    19: ['5-1-1901', 207.21, '5-1-1902', 208.26],
    20: ['5-1-2001', 209.42, '5-1-2002', 207.21],
    21: ['5-1-2101', 207.21, '5-1-2102', 208.26],
    22: ['5-1-2201', 209.42, '5-1-2202', 207.21],
    23: ['5-1-2301', 207.21, '5-1-2302', 208.26],
    24: ['5-1-2401', 208.03, '5-1-2402', 207.21],
    25: ['5-1-2501', 207.21, '5-1-2502', 208.03],
    26: ['5-1-2601', 208.03, '5-1-2602', 207.21],
    27: ['5-1-2701', 207.21, '5-1-2702', 208.03],
    28: ['5-1-2801', 208.03, '5-1-2802', 207.21],
    29: ['5-1-2901', null,     '5-1-2902', null]
  };

  function label(txt, w, h, color, size) {
    var c = document.createElement('canvas'); c.width = 256; c.height = 128;
    var x = c.getContext('2d');
    x.font = '600 ' + (size || 54) + 'px "PingFang SC","Microsoft YaHei",sans-serif';
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.strokeStyle = 'rgba(8,14,13,.9)'; x.lineWidth = 8; x.lineJoin = 'round'; x.strokeText(txt, 128, 64);
    x.fillStyle = color || 'rgba(244,240,231,.96)'; x.fillText(txt, 128, 64);
    var t = new THREE.CanvasTexture(c); t.anisotropy = 4;
    var s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true }));
    s.scale.set(w, h, 1); return s;
  }

  function pick(e) {
    var r = canvas.getBoundingClientRect();
    ptr.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    ptr.y = -((e.clientY - r.top) / r.height) * 2 + 1;
    ray.setFromCamera(ptr, camera);
    var hits = ray.intersectObjects(meshes, false);
    return hits.length ? { m: hits[0].object, point: hits[0].point } : null;
  }

  function style(m, mode) {
    if (!m || !m.material || !m.material.emissive) return;
    var mt = m.material;
    if (mode === 'sel') { mt.emissive.setHex(0xe8d2b4); mt.emissiveIntensity = 0.95; }
    else if (mode === 'hov') { mt.emissive.setHex(0x9fb4b6); mt.emissiveIntensity = 0.5; }
    else { mt.emissive.setHex(0x1a1206); mt.emissiveIntensity = 0.26; }
  }

  function floorInfo(m) {
    if (!m) return '';
    var t = TOWERS[m.userData.ti], f = m.userData.f;
    var head = '<b>' + t.name + ' · ' + f + 'F</b>';
    /* 1F 架空层 */
    if (f <= 1) return head + '<br><span class="dim">架空层</span>';
    var u = FLOOR_UNITS[f];
    if (!u) return head + '<br><span class="dim">暂无户型信息</span>';
    /* 每层两户：房号 · 建筑面积（面积空白时不显示） */
    var u1 = u[1] != null && u[1] !== '' ? (u[0] + ' · ' + u[1] + '㎡') : u[0];
    var u2 = u[3] != null && u[3] !== '' ? (u[2] + ' · ' + u[3] + '㎡') : u[2];
    return head +
      '<br><span class="dim">01户 ' + u1 + '</span>' +
      '<br><span class="dim">02户 ' + u2 + '</span>';
  }

  /* 单户提示信息：按左右侧显示 01/02 户 */
  function unitInfo(t, f, side) {
    var head = '<b>' + t.name + ' · ' + f + 'F</b>';
    if (f <= 1) return head + '<br><span class="dim">架空层</span>';
    var u = FLOOR_UNITS[f];
    if (!u) return head + '<br><span class="dim">暂无户型信息</span>';
    var uu = side ? [u[2], u[3]] : [u[0], u[1]];
    var txt = uu[1] != null && uu[1] !== '' ? (uu[0] + ' · ' + uu[1] + '㎡') : uu[0];
    return head + '<br><span class="dim">' + (side ? '02户' : '01户') + ' · ' + txt + '</span>';
  }

  var _tipV = new THREE.Vector3();
  function showTip(m, point) {
    var t = TOWERS[m.userData.ti], f = m.userData.f;
    var sideRight = m.userData.side > 0;   // -1=左户(01) +1=右户(02)
    tip.innerHTML = unitInfo(t, f, sideRight);
    tip.hidden = false;
    _tipV.setFromMatrixPosition(m.matrixWorld);   // 楼层中心
    _tipV.y += FH * 0.5;                          // 楼层上沿
    _tipV.project(camera);
    var rect = host.getBoundingClientRect();
    var sx = (_tipV.x * 0.5 + 0.5) * rect.width;
    var sy = (-_tipV.y * 0.5 + 0.5) * rect.height;
    var tw = tip.offsetWidth, th = tip.offsetHeight;
    var lx = sx + 16;
    if (lx + tw > rect.width - 6) lx = sx - tw - 14;    // 右侧放不下则翻到左侧
    tip.style.left = Math.max(6, Math.min(rect.width - tw - 6, lx)) + 'px';
    tip.style.top = Math.max(6, sy - th - 12) + 'px';
  }
  function hideTip() { if (tip) tip.hidden = true; }

  function select(m) {
    if (sel) style(sel, 'none');
    sel = m || null;
    if (sel) style(sel, 'sel');
    info.innerHTML = floorInfo(m);
  }

  function addFloorMesh(g, mesh) {
    g.add(mesh); meshes.push(mesh); return mesh;
  }

  /* 斜向香槟金渐变贴图：浅(#F9E7C9)→中(#E1BB8F)→深(#CDA476)，左下→右上 */
  function getGradientTex() {
    if (gradTex) return gradTex;
    var c = document.createElement('canvas'); c.width = 256; c.height = 256;
    var x = c.getContext('2d');
    var g = x.createLinearGradient(0, 256, 256, 0);
    g.addColorStop(0.0, '#CDA476');
    g.addColorStop(0.5, '#E1BB8F');
    g.addColorStop(1.0, '#F9E7C9');
    x.fillStyle = g; x.fillRect(0, 0, 256, 256);
    gradTex = new THREE.CanvasTexture(c);
    gradTex.anisotropy = 4;
    return gradTex;
  }

  /* 轻细颗粒 + 横向拉丝 bump 贴图 */
  function getBrushTex() {
    if (brushTex) return brushTex;
    var size = 128;
    var c = document.createElement('canvas'); c.width = size; c.height = size;
    var x = c.getContext('2d');
    var img = x.createImageData(size, size);
    for (var row = 0; row < size; row++) {
      var base = 120 + Math.round((Math.random() - 0.5) * 10);   // 行间明暗（拉丝）
      for (var col = 0; col < size; col++) {
        var v = base + Math.round((Math.random() - 0.5) * 26);   // 每像素细颗粒
        v = Math.max(0, Math.min(255, v));
        var idx = (row * size + col) * 4;
        img.data[idx] = v; img.data[idx + 1] = v; img.data[idx + 2] = v; img.data[idx + 3] = 255;
      }
    }
    x.putImageData(img, 0, 0);
    brushTex = new THREE.CanvasTexture(c);
    brushTex.wrapS = brushTex.wrapT = THREE.RepeatWrapping;
    brushTex.repeat.set(3, 5);
    brushTex.anisotropy = 4;
    return brushTex;
  }

  /* 太阳光晕贴图：径向渐变圆盘 */
  function makeGlowTex() {
    var c = document.createElement('canvas'); c.width = c.height = 128;
    var x = c.getContext('2d');
    var g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0.0, 'rgba(255,255,255,1)');
    g.addColorStop(0.25, 'rgba(255,245,224,.85)');
    g.addColorStop(0.55, 'rgba(255,226,182,.35)');
    g.addColorStop(1.0, 'rgba(255,210,150,0)');
    x.fillStyle = g; x.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  }

  /* 方形玻璃层（各楼通用，斜向香槟金渐变 + 轻拉丝颗粒）
     —— 按左右两户拆分为两个 mesh，可分别命中、选中与高亮 01/02 户 */
  function boxFloor(g, ti, y, w, d, f, glass) {
    function halfMat() {
      return new THREE.MeshStandardMaterial({
        color: 0xffffff, metalness: 0.5, roughness: 0.38,
        map: getGradientTex(),
        emissive: 0x140f08, emissiveIntensity: 0.22,
        bumpMap: getBrushTex(), bumpScale: 0.012
      });
    }
    var halfGeo = new THREE.BoxGeometry(w / 2, FH, d);
    /* 左半（01户）*/
    var mL = new THREE.Mesh(halfGeo, halfMat());
    mL.position.set(-w / 4, y + FH / 2, 0); mL.castShadow = true;
    mL.userData = { ti: ti, f: f, side: -1 };
    addFloorMesh(g, mL);
    /* 右半（02户）*/
    var mR = new THREE.Mesh(halfGeo, halfMat());
    mR.position.set(w / 4, y + FH / 2, 0); mR.castShadow = true;
    mR.userData = { ti: ti, f: f, side: 1 };
    addFloorMesh(g, mR);
    /* 每层露台：左户/右户 · 南(前)/北(后) 两面各一，呈曲线宽露台（参考图 A 户型） */
    addBalcony(g, ti, y, f, w, d, -1, 1);
    addBalcony(g, ti, y, f, w, d, 1, 1);
    addBalcony(g, ti, y, f, w, d, -1, -1);
    addBalcony(g, ti, y, f, w, d, 1, -1);
    var band = new THREE.Mesh(new THREE.BoxGeometry(w + 0.5, 0.34, d + 0.5),
      new THREE.MeshStandardMaterial({ color: BAND, metalness: 0.6, roughness: 0.35 }));
    band.position.y = y + FH - 0.17; g.add(band);
    return mL;
  }

  /* 外立面阳台（参考 A 户型平面）：
     两户形状不同 —— 01户(左，蓝区形态)为「斜向弧形宽台」，02户(右，粉区形态)为「外凸大弧宽台」；
     颜色 = 与建筑外立面一致的香槟金渐变；
     位置 = 每户南(前)/北(后) 两面各一个露台；01户靠 -x 端、02户靠 +x 端 */
  var _balcCache = {};
  function balcParts(w, side) {
    var th = 0.36, hb = 0.98, key = w.toFixed(1) + (side < 0 ? '_L' : '_R');
    if (_balcCache[key]) return _balcCache[key];
    var bw, depth, plate, railGeo;
    if (side < 0) {
      /* 01户（左 · 蓝色区形态）：斜向弧形宽台，右端深、左端浅，外缘一条主弧 */
      bw = w * 0.36; depth = 2.4;
      var s = new THREE.Shape();
      s.moveTo(-bw / 2, 0); s.lineTo(bw / 2, 0);
      s.quadraticCurveTo(bw * 0.52, depth * 0.62, bw * 0.34, depth * 1.0);
      s.quadraticCurveTo(bw * 0.08, depth * 1.1, -bw * 0.32, depth * 0.84);
      s.quadraticCurveTo(-bw * 0.5, depth * 0.68, -bw / 2, depth * 0.28);
      s.lineTo(-bw / 2, 0);
      plate = new THREE.ExtrudeGeometry(s, { depth: th, bevelEnabled: true, bevelThickness: 0.1, bevelSize: 0.1, bevelSegments: 3, curveSegments: 16 });
      plate.rotateX(Math.PI / 2);
      railGeo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
        new THREE.Vector3(bw * 0.5, hb, depth * 0.58),
        new THREE.Vector3(bw * 0.34, hb, depth * 1.0),
        new THREE.Vector3(bw * 0.08, hb, depth * 1.1),
        new THREE.Vector3(-bw * 0.32, hb, depth * 0.84),
        new THREE.Vector3(-bw * 0.5, hb, depth * 0.66)
      ]), 36, 0.12, 8, false);
    } else {
      /* 02户（右 · 粉色区形态）：外凸大弧宽台，更宽更深，外缘近半圆 */
      bw = w * 0.46; depth = 3.0;
      var s2 = new THREE.Shape();
      s2.moveTo(-bw / 2, 0); s2.lineTo(bw / 2, 0);
      s2.quadraticCurveTo(bw * 0.5, depth * 1.02, 0, depth * 1.14);
      s2.quadraticCurveTo(-bw * 0.5, depth * 1.02, -bw / 2, 0);
      plate = new THREE.ExtrudeGeometry(s2, { depth: th, bevelEnabled: true, bevelThickness: 0.1, bevelSize: 0.1, bevelSegments: 3, curveSegments: 18 });
      plate.rotateX(Math.PI / 2);
      railGeo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
        new THREE.Vector3(bw * 0.5, hb, depth * 0.72),
        new THREE.Vector3(bw * 0.28, hb, depth * 1.05),
        new THREE.Vector3(0, hb, depth * 1.14),
        new THREE.Vector3(-bw * 0.28, hb, depth * 1.05),
        new THREE.Vector3(-bw * 0.5, hb, depth * 0.72)
      ]), 38, 0.12, 8, false);
    }
    return (_balcCache[key] = { plate: plate, rail: railGeo, bw: bw });
  }
  function addBalcony(g, ti, y, f, w, d, side, face) {
    var parts = balcParts(w, side);
    var mat = new THREE.MeshStandardMaterial({
      color: 0xffffff, metalness: 0.5, roughness: 0.38,
      map: getGradientTex(), emissive: 0x140f08, emissiveIntensity: 0.22,
      bumpMap: getBrushTex(), bumpScale: 0.012
    });
    var railMat = new THREE.MeshStandardMaterial({ color: 0xe6d0b0, metalness: 0.6, roughness: 0.32 });
    var outer = side < 0 ? -w * 0.5 : w * 0.5;
    var cx = outer + (side < 0 ? parts.bw * 0.5 : -parts.bw * 0.5);
    var grp = new THREE.Group();
    var plate = new THREE.Mesh(parts.plate, mat);
    plate.castShadow = plate.receiveShadow = true; grp.add(plate);
    var rail = new THREE.Mesh(parts.rail, railMat);
    rail.castShadow = true; grp.add(rail);
    if (face < 0) grp.rotation.y = Math.PI;   // 北面：露台朝 -z
    grp.position.set(cx, y, face < 0 ? -d / 2 : d / 2);
    g.add(grp);
  }

  /* 双拱冠（D 栋）：屋顶并排两个半圆拱洞 */
  function addArchCrown(g, top, w, d) {
    var body = new THREE.MeshStandardMaterial({ color: 0x2b2019, metalness: 0.5, roughness: 0.45 });
    var edge = new THREE.MeshStandardMaterial({ color: 0xe8d2b4, metalness: 0.7, roughness: 0.28 });
    var R = w * 0.22;
    var cx = w * 0.26;
    [-1, 1].forEach(function (s) {
      var arch = new THREE.Mesh(new THREE.TorusGeometry(R, R * 0.13, 12, 30, Math.PI), body);
      arch.position.set(s * cx, top, 0);
      arch.castShadow = true; g.add(arch);
      var rim = new THREE.Mesh(new THREE.TorusGeometry(R, R * 0.06, 10, 30, Math.PI), edge);
      rim.position.set(s * cx, top, 0); g.add(rim);
    });
    var plank = new THREE.Mesh(new THREE.BoxGeometry(w + 0.4, 0.9, d + 0.4), body);
    plank.position.y = top + 0.45; plank.receiveShadow = true; g.add(plank);
  }

  /* 深色竖向结构肋，环绕楼体并贯穿全高 */
  function addRibs(g, ti, yBase, yTop, fn) {
    var h = yTop - yBase;
    var mt = new THREE.MeshStandardMaterial({ color: DARK, metalness: 0.45, roughness: 0.5 });
    fn(function (px, pz, pw, pd) {
      var rib = new THREE.Mesh(new THREE.BoxGeometry(pw, h, pd), mt);
      rib.position.set(px, yBase + h / 2, pz);
      rib.castShadow = true; g.add(rib);
    });
  }

  function buildTower(t, ti) {
    var g = new THREE.Group();
    g.position.set(t.x, 0, t.z);
    if (t.rot) g.rotation.y = t.rot;
    group.add(g);

    var glass = t.glass || CHAMP;

    /* 架空层基座 */
    var skirt = 0;
    var base = new THREE.Mesh(new THREE.BoxGeometry(t.w + skirt + 0.6, BH, t.d + skirt + 0.6),
      new THREE.MeshStandardMaterial({ color: 0x8a6a3e, metalness: 0.45, roughness: 0.5, emissive: 0x1a0f06, emissiveIntensity: 0.2 }));
    base.position.y = BH / 2; base.castShadow = true; g.add(base);

    var y = BH;
    for (var i = 0; i < t.floors; i++) {
      var f = i + 1, w = t.w, d = t.d;
      boxFloor(g, ti, y, w, d, f, glass);
      y += FH;
    }
    var top = y;

    /* 竖向结构肋 */
    addRibs(g, ti, BH, top, function (place) {
      var hw = t.w / 2, hd = t.d / 2;
      place(-hw, -hd, 0.8, 0.8); place(hw, -hd, 0.8, 0.8);
      place(-hw, hd, 0.8, 0.8); place(hw, hd, 0.8, 0.8);
      place(0, -hd, 0.5, 0.7); place(0, hd, 0.5, 0.7);
      place(-hw, 0, 0.7, 0.5); place(hw, 0, 0.7, 0.5);
    });

    /* 顶部造型 */
    var crownMat = new THREE.MeshStandardMaterial({ color: 0xe8d2b4, metalness: 0.65, roughness: 0.3 });
    if (t.style === 'arch') {
      addArchCrown(g, top, t.w, t.d);
    } else {
      var roofT = new THREE.Mesh(new THREE.BoxGeometry(t.w + 0.4, 1.0, t.d + 0.4), base.material);
      roofT.position.y = top + 0.5; roofT.castShadow = true; g.add(roofT);
      var crown2 = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.4, 3.4, 8), crownMat);
      crown2.position.y = top + 2.2; g.add(crown2);
    }

    /* 楼栋名标注 */
    var nm = label(t.name, 5, 2.6, 'rgba(232,210,180,.95)', 44);
    nm.position.set(0, top + (t.style === 'arch' ? t.w * 0.22 * 2 + 1.5 : 4.4), t.d / 2 + 1); g.add(nm);

    t.top = top;
    return g;
  }

  function buildAll() {
    group = new THREE.Group();
    TOWERS.forEach(function (t, i) { buildTower(t, i); });
    scene.add(group);
  }

  /* ===== 大沙盘：天鹅形中央湖系 =====
     湖体沿 S 形折线串成「天鹅颈 + 双翼」大湖，宽端朝南北、颈部收窄；[x, z, 半径] */
  var LAKE = [
    [-160, -40, 120], [-40, 50, 110], [90, 70, 120],
    [200, 0, 130], [120, -110, 100], [-260, -140, 110],
    [-40, -170, 95], [40, 180, 120], [190, 210, 110]
  ];
  /* 湖岸灯带路径（贴岸线内侧，供 buildLakeLights 使用） */
  var LAKE_SHORE = [
    [-160, -40], [-40, 50], [90, 70], [200, 0], [120, -110],
    [-260, -140], [-40, -170], [40, 180], [190, 210]
  ];
  /* 距离湖中心线的横向距离（>0 表示陆地外侧），用于岸线判定 */
  function distLake(x, z) {
    var min = 1e9;
    for (var i = 0; i < LAKE.length; i++) {
      var cx = LAKE[i][0], cz = LAKE[i][1], d = Math.sqrt((x - cx) * (x - cx) + (z - cz) * (z - cz)) - LAKE[i][2];
      if (d < min) min = d;
    }
    return min;
  }

  /* 地形高度场：天鹅形湖体下凹、中央圆塔小岛隆起、公园绿谷微抬、外围坡地渐升、细噪声起伏 */
  function terrainH(x, z) {
    var h = 0, r = Math.sqrt(x * x + z * z);
    h += Math.max(0, (r - 560) * 0.09);                        // 外围坡地
    for (var i = 0; i < LAKE.length; i++) {                     // 中部贯穿湖体
      var cx = LAKE[i][0], cz = LAKE[i][1], cr = LAKE[i][2];
      var d = Math.sqrt((x - cx) * (x - cx) + (z - cz) * (z - cz));
      h -= 7.6 * Math.exp(-(d * d) / (2 * cr * cr));
    }
    h += 16 * Math.exp(-((x - 330) * (x - 330) + (z - 230) * (z - 230)) / (2 * 42 * 42)); // 中南地标塔半岛
    h += 2.6 * Math.exp(-((x + 272) * (x + 272) + (z + 360) * (z + 360)) / (2 * 230 * 230)); // 西中北主塔台地
    h += 3.4 * Math.exp(-((x - 360) * (x - 360) + (z + 320) * (z + 320)) / (2 * 260 * 260)); // 东北板式塔楼台地
    h += 3.8 * Math.exp(-((x - 540) * (x - 540) + (z + 300) * (z + 300)) / (2 * 190 * 190)); // 右上山坡梯田（低层组团）
    h += 2.2 * Math.exp(-((x + 320) * (x + 320) + (z - 120) * (z - 120)) / (2 * 180 * 180)); // 西南公园绿谷
    h += 0.35 * Math.sin(x * 0.05) * Math.cos(z * 0.045);
    h += 0.12 * Math.sin(x * 0.12 + z * 0.09);
    return h;
  }

  function buildGround() {
    /* 大沙盘地表：天鹅湖谷地 + 顶点色分层（水底/沙滩/岸绿/草坪/亮草） */
    var SIZE = 1500, seg = 180;
    var geo = new THREE.PlaneGeometry(SIZE, SIZE, seg, seg);
    geo.rotateX(-Math.PI / 2);
    var pos = geo.attributes.position;
    var cBed = new THREE.Color(0x1f7380), cSand = new THREE.Color(0xb9aa6a);
    var cShore = new THREE.Color(0x8fa05e), cGrass = new THREE.Color(0x4f7a3a), cGrass2 = new THREE.Color(0x6a9a4a);
    var colors = [];
    for (var i = 0; i < pos.count; i++) {
      var x = pos.getX(i), z = pos.getZ(i), h = terrainH(x, z);
      pos.setY(i, h);
      var c;
      if (h < -2.2) c = cBed; else if (h < -0.5) c = cSand;
      else if (h < 0.8) c = cShore; else if (h < 3.2) c = cGrass; else c = cGrass2;
      colors.push(c.r, c.g, c.b);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    var g = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 }));
    g.receiveShadow = true; scene.add(g);
    /* 大湖水面：半透明暖绿，覆盖天鹅湖低洼区 */
    var w = new THREE.Mesh(new THREE.PlaneGeometry(SIZE, SIZE),
      new THREE.MeshStandardMaterial({ color: 0x3fc6d8, roughness: 0.22, metalness: 0.12, transparent: true, opacity: 0.9 }));
    w.rotation.x = -Math.PI / 2; w.position.y = -1.7; scene.add(w);
    /* 岩石堤岸：沿天鹅湖边缘撒布浅色岩块 */
    var rockGeo = new THREE.DodecahedronGeometry(3.4, 0);
    var rockMat = new THREE.MeshStandardMaterial({ color: 0x9aa08c, roughness: 0.92 });
    var nRock = 520, rock = new THREE.InstancedMesh(rockGeo, rockMat, nRock);
    var m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    var placed = 0;
    for (var ri = 0; ri < nRock * 6 && placed < nRock; ri++) {
      var rx = (Math.random() * 2 - 1) * 640, rz = (Math.random() * 2 - 1) * 640;
      var dl = distLake(rx, rz);
      if (dl > -2 && dl < 5) {                       // 湖岸线±2 内撒岩
        var hh = terrainH(rx, rz), sc = 0.7 + Math.random() * 1.1;
        p.set(rx, hh + 0.4, rz); s.set(sc, sc * 0.7, sc); 
        q.setFromEuler(new THREE.Euler(Math.random(), Math.random() * 6, Math.random()));
        m.compose(p, q, s); rock.setMatrixAt(placed++, m);
      }
    }
    rock.count = placed; rock.castShadow = true; rock.instanceMatrix.needsUpdate = true;
    scene.add(rock);
    /* 中央园区香槟金环（全景入场基准地面标识） */
    baseRing = new THREE.Mesh(new THREE.RingGeometry(150, 156, 96),
      new THREE.MeshBasicMaterial({ color: 0xe8d2b4, transparent: true, opacity: 0.4, side: THREE.DoubleSide }));
    baseRing.rotation.x = -Math.PI / 2; baseRing.position.set(-272, 0.06, -360); scene.add(baseRing);
  }

  /* 程序化植被：树干 + 阔叶树冠（InstancedMesh 批量，避开楼栋与湖心） */
  function buildTrees() {
    /* 大范围阔叶林：避开湖面、道路与楼栋地块；西南公园绿谷加密成林 */
    var mats = [], tries = 0;
    while (mats.length < 620 && tries < 9000) {
      tries++;
      var x = (Math.random() * 2 - 1) * 620, z = (Math.random() * 2 - 1) * 620;
      var dl = distLake(x, z), h = terrainH(x, z);
      var inPark = x > -470 && x < -170 && z > 20 && z < 300;   // 西南绿谷（加密成林）
      var inWest = x > -650 && x < -360 && z > -500 && z < -150; // 西北低层（少量）
      var inEast = x > 400 && x < 650 && z > -580 && z < -300;  // 右上山坡（适量）
      if (dl > 4 && h > -0.4 && h < 16 && !inWest && !inEast) {
        if (inPark || Math.random() < 0.55) mats.push([x, h, z]);
      }
    }
    var trunkGeo = new THREE.CylinderGeometry(0.55, 0.8, 4.6, 6);
    var trunkMat = new THREE.MeshStandardMaterial({ color: 0x5a4630, roughness: 0.95 });
    var canopyGeo = new THREE.IcosahedronGeometry(3.4, 0);
    var canopyMat = new THREE.MeshStandardMaterial({ color: 0x3f6f33, roughness: 0.85 });
    var k = mats.length;
    var trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, k);
    var canopies = new THREE.InstancedMesh(canopyGeo, canopyMat, k);
    var m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    for (var j = 0; j < k; j++) {
      var c = mats[j], sc = 0.8 + Math.random() * 1.4, th = 3.0 + Math.random() * 2.6;
      q.setFromEuler(new THREE.Euler(0, Math.random() * 6, 0));
      p.set(c[0], c[1] + th / 2, c[2]); s.set(sc, th, sc);
      m.compose(p, q, s); trunks.setMatrixAt(j, m);
      p.set(c[0], c[1] + th + sc * 1.6, c[2]); s.set(sc * 1.5, sc * 1.2, sc * 1.5);
      m.compose(p, q, s); canopies.setMatrixAt(j, m);
    }
    trunks.castShadow = canopies.castShadow = true;
    trunks.instanceMatrix.needsUpdate = canopies.instanceMatrix.needsUpdate = true;
    scene.add(trunks); scene.add(canopies);
  }

  /* 西岸红色地标拱桥：飞跨天鹅湖颈部，红色双拱肋 + 桥面 + 桥墩 */
  function buildArchBridge() {
    var z = -10, x0 = -200, x1 = 60, len = x1 - x0;
    var pts = [];
    for (var i = 0; i <= 30; i++) {
      var t = i / 30, x = x0 + t * len;
      pts.push(new THREE.Vector3(x, 3 + 24 * (1 - Math.pow(2 * t - 1, 2)), z));
    }
    var red = new THREE.MeshStandardMaterial({ color: 0xc2503a, roughness: 0.42, metalness: 0.25, emissive: 0x220c06, emissiveIntensity: 0.3 });
    var deck = new THREE.MeshStandardMaterial({ color: 0xc8c8c6, roughness: 0.82 });
    [-1, 1].forEach(function (sd) {
      var rib = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 2.1, 12), red);
      rib.position.z = sd * 8; rib.castShadow = true; scene.add(rib);
    });
    var deckM = new THREE.Mesh(new THREE.BoxGeometry(len, 1.3, 17), deck);
    deckM.position.set(x0 + len / 2, 2.4, z); deckM.castShadow = deckM.receiveShadow = true; scene.add(deckM);
    [-0.34, 0, 0.34].forEach(function (f) {
      var pier = new THREE.Mesh(new THREE.BoxGeometry(6, 12, 6), deck);
      pier.position.set(x0 + len / 2 + f * len, -1.5, z); pier.castShadow = true; scene.add(pier);
    });
  }

  /* 道路系统：外围环道 + 沿湖别墅S形主街 + 湖岸浅色步道 */
  function buildRoads() {
    var asphalt = new THREE.MeshStandardMaterial({ color: 0x4c5052, roughness: 0.9 });
    var light = new THREE.MeshStandardMaterial({ color: 0xcdd2cf, roughness: 0.85 });
    function road(arr, rad, mat, closed) {
      var pts = arr.map(function (p) { return new THREE.Vector3(p[0], terrainH(p[0], p[1]) + 0.55, p[1]); });
      var t = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, !!closed, 'catmullrom', 0.3), 140, rad, 8), mat);
      t.receiveShadow = true; scene.add(t);
    }
    /* 主干道：西南→东北 对角线贯穿（照片深灰主路） */
    road([[-560, 420], [-300, 200], [-60, 40], [180, -80], [420, -220], [600, -360]], 5.4, asphalt, false);
    /* 环湖环路 */
    road([[-360, -240], [-120, -260], [160, -180], [300, -60], [300, 160], [120, 300], [-140, 300], [-320, 160], [-360, -240]], 4.2, asphalt, true);
    /* 塔楼轴线支路 + 西北网格支路 + 右上山坡支路 */
    road([[-520, -240], [-360, -360], [-200, -430]], 3.4, asphalt, false);
    road([[-540, 420], [-470, 260], [-430, 100]], 3.0, asphalt, false);
    road([[420, -360], [520, -400], [620, -440]], 3.0, asphalt, false);
    /* 湖岸浅色步道 */
    road([[260, -120], [120, 250], [-60, 300], [-240, 240]], 2.6, light, false);
  }

  /* 中央公园绿谷（西南）：大草坪圆盘 + 圆形广场 + 同心环景 + 中央水景 + 放射小径 */
  function buildPark() {
    var cx = -330, cz = 160, gy = terrainH(cx, cz);
    var pave = new THREE.MeshStandardMaterial({ color: 0xd8c8a8, roughness: 0.9 });
    var trim = new THREE.MeshStandardMaterial({ color: 0x9a7a4a, roughness: 0.85 });
    var white = new THREE.MeshStandardMaterial({ color: 0xe9e5da, roughness: 0.8 });
    var grass = new THREE.MeshStandardMaterial({ color: 0x5f8a44, roughness: 0.95 });
    var lawn = new THREE.Mesh(new THREE.CylinderGeometry(115, 117, 0.5, 72), grass);
    lawn.position.set(cx, gy + 0.12, cz); lawn.receiveShadow = true; scene.add(lawn);
    var plaza = new THREE.Mesh(new THREE.CylinderGeometry(48, 50, 1.1, 64), pave);
    plaza.position.set(cx, gy + 0.7, cz); plaza.receiveShadow = true; scene.add(plaza);
    [40, 31, 22, 13].forEach(function (r) {
      var sp = new THREE.Mesh(new THREE.TorusGeometry(r, 1.1, 8, 56), trim);
      sp.rotation.x = Math.PI / 2; sp.position.set(cx, gy + 1.35, cz); scene.add(sp);
    });
    var fount = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 2.8, 10, 20), white);
    fount.position.set(cx, gy + 5.5, cz); fount.castShadow = true; scene.add(fount);
    for (var a = 0; a < 6; a++) {
      var ang = (a / 6) * Math.PI * 2, pts = [];
      for (var i = 0; i <= 7; i++) {
        var rr = 40 + i * 20, px = cx + Math.cos(ang) * rr, pz = cz + Math.sin(ang) * rr;
        pts.push(new THREE.Vector3(px, terrainH(px, pz) + 0.45, pz));
      }
      var walk = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 2.2, 8), pave);
      walk.castShadow = true; scene.add(walk);
    }
  }

  /* 湖上白色人行小桥 + 北岸游艇码头（浮动平台+泊位栈道） */
  function buildWhiteBridges() {
    var white = new THREE.MeshStandardMaterial({ color: 0xf2efe6, roughness: 0.7 });
    var routes = [
      [[-120,180],[-20,140],[80,160],[180,120]],
      [[-40,-70],[40,-120],[140,-80]]
    ];
    routes.forEach(function (r) {
      var pts = r.map(function (p, i) {
        var h = terrainH(p[0], p[1]);
        var lift = Math.sin(i / (r.length - 1) * Math.PI) * 2.4;
        return new THREE.Vector3(p[0], Math.max(h, -1.7) + 1.8 + lift, p[1]);
      });
      var b = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 60, 1.7, 8), white);
      b.castShadow = true; scene.add(b);
      var rail = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 60, 0.6, 8), white);
      rail.position.y = 2.0; scene.add(rail);
    });
    var dock = new THREE.MeshStandardMaterial({ color: 0xe8e4da, roughness: 0.7 });
    var pl = new THREE.Mesh(new THREE.BoxGeometry(180, 1.8, 11), dock);
    pl.position.set(-120, -0.5, -180); pl.receiveShadow = true; scene.add(pl);
    var gang = new THREE.Mesh(new THREE.BoxGeometry(90, 1.6, 13), dock);
    gang.position.set(-80, -0.6, -140); scene.add(gang);
    var boatM = new THREE.MeshStandardMaterial({ color: 0xf6f4ee, roughness: 0.5 });
    for (var i = 0; i < 5; i++) {
      var boat = new THREE.Mesh(new THREE.BoxGeometry(30, 3, 6), boatM);
      boat.position.set(-140 + i * 24, 0.6, -180); scene.add(boat);
    }
  }

  /* 远景天际线：外围坡地一圈灰色楼群，勾勒城市轮廓 */
  function buildPeripheral() {
    var m1 = new THREE.MeshStandardMaterial({ color: 0x3c4447, roughness: 0.9, metalness: 0.1 });
    var m2 = new THREE.MeshStandardMaterial({ color: 0x4a5054, roughness: 0.9, metalness: 0.1 });
    var n = 26;
    for (var i = 0; i < n; i++) {
      var a = (i / n) * Math.PI * 2 + 0.13 * (i % 3);
      var r = 640 + (i % 3) * 44, x = Math.cos(a) * r, z = Math.sin(a) * r;
      var hgt = 44 + (i % 4) * 16, wd = 24 + (i % 3) * 6;
      var b = new THREE.Mesh(new THREE.BoxGeometry(wd, hgt, wd), i % 2 ? m1 : m2);
      b.position.set(x, terrainH(x, z) + hgt / 2, z); b.castShadow = true; scene.add(b);
    }
  }

  /* 对岸（东南）板式高层塔楼群：与西北主塔组呼应，构成两翼天际线 */
  function buildDecoTowers() {
    var gold = new THREE.MeshStandardMaterial({ color: 0xbaa075, metalness: 0.5, roughness: 0.42, map: getGradientTex() });
    var gold2 = new THREE.MeshStandardMaterial({ color: 0xccb48c, metalness: 0.5, roughness: 0.4, map: getGradientTex() });
    var rects = [
      [300, -200, 26, 22, 52], [390, -230, 24, 20, 46], [470, -260, 24, 20, 40],
      [340, -310, 26, 22, 48], [420, -350, 22, 20, 44], [490, -380, 24, 20, 38],
      [300, -420, 26, 22, 42], [430, -460, 22, 20, 36], [360, -180, 24, 22, 50]
    ];
    rects.forEach(function (r, i) {
      var x = r[0], z = r[1], w = r[2], d = r[3], fl = r[4];
      var hTop = fl * FH + BH, mat = i % 2 ? gold : gold2, gy = terrainH(x, z);
      var base = new THREE.Mesh(new THREE.BoxGeometry(w + 1.2, BH, d + 1.2), mat);
      base.position.set(x, gy + BH / 2, z); base.receiveShadow = true; scene.add(base);
      var body = new THREE.Mesh(new THREE.BoxGeometry(w, hTop, d), mat);
      body.position.set(x, gy + hTop / 2, z); body.castShadow = true; scene.add(body);
      var crown = new THREE.Mesh(new THREE.BoxGeometry(w + 1.4, 2, d + 1.4), mat);
      crown.position.set(x, gy + hTop + 1, z); scene.add(crown);
    });
  }

  /* 中央地标圆塔：天鹅湖心小岛上的标志性 360° 环幕塔 */
  function buildRoundTower() {
    var ix = 330, iz = 230, gy = terrainH(ix, iz);
    var dark = new THREE.MeshStandardMaterial({ color: 0x3a2f26, metalness: 0.5, roughness: 0.45 });
    var dark2 = new THREE.MeshStandardMaterial({ color: 0x2b2019, metalness: 0.55, roughness: 0.4 });
    var plat = new THREE.Mesh(new THREE.CylinderGeometry(52, 58, 2.6, 64), new THREE.MeshStandardMaterial({ color: 0xcbbf9f, roughness: 0.85 }));
    plat.position.set(ix, gy - 1.3, iz); plat.receiveShadow = true; scene.add(plat);
    var R = 22, hT = 150;
    var body = new THREE.Mesh(new THREE.CylinderGeometry(R, R + 2, hT, 64), dark);
    body.position.set(ix, gy + hT / 2, iz); body.castShadow = true; scene.add(body);
    for (var yy = 20; yy < hT; yy += 18) {
      var band = new THREE.Mesh(new THREE.TorusGeometry(R + 0.7, 1.3, 10, 64), dark2);
      band.rotation.x = Math.PI / 2; band.position.set(ix, gy + yy, iz); scene.add(band);
    }
    var cap = new THREE.Mesh(new THREE.CylinderGeometry(R + 1.2, R + 2, 6, 64), dark2);
    cap.position.set(ix, gy + hT + 3, iz); cap.castShadow = true; scene.add(cap);
    var lb = label('天际地标塔', 22, 8, 'rgba(232,214,190,.96)', 42);
    lb.position.set(ix, gy + hT + 26, iz); scene.add(lb);
  }

  /* 东南岸低层白色别墅/洋房群：沿天鹅湖东岸S形布置，配泳池与私人码头 */
  function buildVillas() {
    var wall = new THREE.MeshStandardMaterial({ color: 0xeae6da, roughness: 0.85 });
    var roof = new THREE.MeshStandardMaterial({ color: 0x8a7a5e, roughness: 0.8 });
    var poolM = new THREE.MeshStandardMaterial({ color: 0x7fd0d8, roughness: 0.2, metalness: 0.1, transparent: true, opacity: 0.85 });
    function villa(x, z, sc) {
      var gy = terrainH(x, z), g = new THREE.Group();
      var w = (14 + Math.random() * 8) * (sc || 1), d = (11 + Math.random() * 6) * (sc || 1), h = (3.2 + Math.random() * 2.2) * (sc || 1);
      var b1 = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wall);
      b1.position.y = h / 2; b1.castShadow = true; g.add(b1);
      var rf = new THREE.Mesh(new THREE.ConeGeometry(Math.max(w, d) * 0.62, 2.6, 4), roof);
      rf.rotation.y = Math.PI / 4; rf.position.y = h + 1.3; rf.castShadow = true; g.add(rf);
      var pool = new THREE.Mesh(new THREE.BoxGeometry(w * 0.5, 0.5, 4.4), poolM);
      pool.position.set(0, 0.28, d / 2 + 4); g.add(pool);
      g.position.set(x, gy + 0.2, z); g.rotation.y = (Math.random() - 0.5) * 0.3; scene.add(g);
    }
    /* 西北角白色低层网格组团（照片左上角成片白屋） */
    var nx = 0;
    for (var gx = -620; gx <= -380 && nx < 40; gx += 34) {
      for (var gz = -180; gz >= -470 && nx < 40; gz -= 34) {
        if (distLake(gx, gz) > 6) { villa(gx, gz, 0.9); nx++; }
      }
    }
    /* 右上山坡梯田低层组团（照片右上坡地白屋） */
    var ry = 0;
    for (var sx = 430; sx <= 620 && ry < 22; sx += 36) {
      for (var sz = -320; sz >= -560 && ry < 22; sz -= 30) {
        if (distLake(sx, sz) > 6) { villa(sx, sz, 1); ry++; }
      }
    }
    /* 沿湖南岸私人码头 */
    var dockMat = new THREE.MeshStandardMaterial({ color: 0xdcd6c6, roughness: 0.8 });
    for (var i = 0; i < 4; i++) {
      var dx = 120 + Math.random() * 220, dz = 200 + Math.random() * 260;
      if (distLake(dx, dz) > -4 && distLake(dx, dz) < 2) {
        var dkN = new THREE.Mesh(new THREE.BoxGeometry(20, 1.2, 4), dockMat);
        dkN.position.set(dx, -0.2, dz); scene.add(dkN);
      }
    }
  }

  /* 西北岸文化建筑：弧形场馆（半圆筒壳）+ 三叶草艺术馆（三瓣圆柱）+ 观景平台 */
  function buildCulture() {
    var white = new THREE.MeshStandardMaterial({ color: 0xf0ede6, metalness: 0.2, roughness: 0.6, side: THREE.DoubleSide });
    var glassC = new THREE.MeshStandardMaterial({ color: 0xbfe4e6, metalness: 0.3, roughness: 0.25, transparent: true, opacity: 0.75 });
    var blue = new THREE.MeshStandardMaterial({ color: 0x63cfe0, roughness: 0.2, metalness: 0.1, transparent: true, opacity: 0.85 });
    /* 弧形场馆（半圆筒壳）——南区西侧 */
    var shell = new THREE.Mesh(new THREE.CylinderGeometry(58, 58, 26, 48, 1, true, Math.PI, Math.PI), white);
    shell.position.set(-300, terrainH(-300, 460) + 13, 460); shell.castShadow = true; scene.add(shell);
    var shellF = new THREE.Mesh(new THREE.CylinderGeometry(55, 55, 24, 48, 1, true, Math.PI, Math.PI), glassC);
    shellF.position.set(-300, terrainH(-300, 460) + 12, 460); scene.add(shellF);
    /* 三叶草/十字花瓣艺术馆群——南区中部（白色有机形态） */
    var lobes = [[-180, 320, 30], [-80, 380, 28], [20, 340, 26], [-140, 440, 24], [80, 420, 24], [240, 360, 28], [260, 470, 26]];
    lobes.forEach(function (o) {
      var cx = o[0], cz = o[1], r = o[2];
      [[0, 0, r * 0.62], [-r * 0.58, -r * 0.28, r * 0.44], [r * 0.58, -r * 0.28, r * 0.44]].forEach(function (p) {
        var tr = new THREE.Mesh(new THREE.CylinderGeometry(p[2], p[2] + 2, 20, 30), white);
        tr.position.set(cx + p[0], terrainH(cx + p[0], cz + p[1]) + 10, cz + p[1]);
        tr.castShadow = true; scene.add(tr);
      });
    });
    /* 圆形广场（南端中央） */
    var plaza = new THREE.Mesh(new THREE.CylinderGeometry(36, 38, 1.2, 56), white);
    plaza.position.set(-40, terrainH(-40, 520) + 0.7, 520); plaza.receiveShadow = true; scene.add(plaza);
    /* 蓝色水景 */
    var pool = new THREE.Mesh(new THREE.CylinderGeometry(16, 18, 0.8, 48), blue);
    pool.position.set(-260, terrainH(-260, 250) + 0.5, 250); scene.add(pool);
  }

  /* 湖岸灯带：沿天鹅湖岸线外侧布设暖色光点，黄昏点亮 */
  function buildLakeLights() {
    var pts = [], tries = 0;
    while (pts.length < 190 && tries < 6000) {
      tries++;
      var x = (Math.random() * 2 - 1) * 600, z = (Math.random() * 2 - 1) * 600;
      var dl = distLake(x, z);
      if (dl > 0.6 && dl < 6) pts.push([x, z]);
    }
    var inst = new THREE.InstancedMesh(new THREE.SphereGeometry(2.3, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xffd27a }), pts.length);
    var m = new THREE.Matrix4();
    pts.forEach(function (p, i) {
      m.setPosition(p[0], Math.max(terrainH(p[0], p[1]), -1.7) + 1.5, p[1]);
      inst.setMatrixAt(i, m);
    });
    inst.instanceMatrix.needsUpdate = true; scene.add(inst);
  }

  /* 组装俯瞰环境 */
  function buildEnvironment() {
    buildTrees();
    buildRoads();
    buildArchBridge();
    buildPark();
    buildWhiteBridges();
    buildPeripheral();
    buildDecoTowers();
    buildRoundTower();
    buildVillas();
    buildCulture();
    buildLakeLights();
  }

  /* ===== 户型 3D 俯瞰模型 =====
     精确按参考户型图（A户型 · 208㎡ · 3室2厅4卫2多功能房）：
     底部总宽 21120mm（分段 3600/5590/2930/1800/3100/4100）
     左侧总高 18625mm（分段 1435/5700/2540/5460/3490） */
  function buildUnitModel(mirror) {
    var S = .001, H = 2.6, CX = 10560, CY = 9312.5;
    function xs(v) { v = (v - CX) * S; return mirror ? -v : v; }
    function zs(v) { return (v - CY) * S; }
    function xc(a, b) { return (xs(a) + xs(b)) / 2; }
    function zn(a, b) { return (zs(a) + zs(b)) / 2; }
    function wd(a, b) { return Math.abs(xs(b) - xs(a)); }
    function zd(a, b) { return Math.abs(zs(b) - zs(a)); }
    var g = new THREE.Group();
    var mt = {};
    mt.base = new THREE.MeshStandardMaterial({ color: 0x2c2f31, metalness: .3, roughness: .7 });
    mt.wall = new THREE.MeshStandardMaterial({ color: 0xe7e0d4, roughness: .85 });
    mt.dark = new THREE.MeshStandardMaterial({ color: 0x6a5140, roughness: .7 });
    mt.balc = new THREE.MeshStandardMaterial({ color: 0xe9e2d2, roughness: .8 });
    mt.elev = new THREE.MeshStandardMaterial({ color: 0x9aa0a4, metalness: .5, roughness: .4 });
    /* 底座 + 整层楼板 */
    var base = new THREE.Mesh(new THREE.BoxGeometry(23.5, 1.3, 20.6), mt.base);
    base.position.y = -1.05; base.receiveShadow = true; g.add(base);
    var fl = new THREE.Mesh(new THREE.BoxGeometry(21.12, .24, 18.625),
      new THREE.MeshStandardMaterial({ color: 0xd8cfc2, roughness: .9 }));
    fl.position.set(0, .12, 0); fl.receiveShadow = true; g.add(fl);
    /* 房间 [名称, x0,x1, y0,y1, 颜色, 类型]  · y 为平面进深（图纵向） */
    var R = [
      ['次卧 · 西', 0, 3600, 1435, 7135, 0xcdb393, 'b'],
      ['电梯厅', 0, 3600, 7135, 15135, 0xd6cec1, 'e'],
      ['生活阳台', 0, 3600, 15135, 18625, 0xb7c6c4, 'l'],
      ['客厅', 3600, 9190, 1435, 9675, 0xd9c8ad, 's'],
      ['餐厅', 3600, 9190, 9675, 15135, 0xd2c4a8, 'd'],
      ['厨房', 9190, 13920, 15135, 18625, 0xb9ab97, 'k'],
      ['多功能房', 9190, 12120, 1435, 7135, 0xd6c4a0, 't'],
      ['主卫', 12120, 13920, 9675, 15135, 0xaebfc0, 'w'],
      ['主卧', 13920, 21120, 9675, 15135, 0xcdb393, 'b'],
      ['卫 · 东南', 13920, 17020, 1435, 5135, 0xaebfc0, 'w'],
      ['次卧 · 东', 17020, 21120, 1435, 8240, 0xcdb393, 'b']
    ];
    var fx = mirror ? -1 : 1;
    function wall(x0, z0, x1, z1) {
      var m = new THREE.Mesh(new THREE.BoxGeometry(Math.max(.16, Math.abs(xs(x1) - xs(x0))), H, Math.max(.16, Math.abs(zs(z1) - zs(z0)))), mt.wall);
      m.position.set(xc(x0, x1), .15 + H / 2, zn(z0, z1)); m.castShadow = true; g.add(m);
    }
    R.forEach(function (r) {
      var cx = xc(r[1], r[2]), cz = zn(r[3], r[4]), wk = wd(r[1], r[2]), dk = zd(r[3], r[4]);
      var m = new THREE.Mesh(new THREE.BoxGeometry(wk, .07, dk),
        new THREE.MeshStandardMaterial({ color: r[5], roughness: .86 }));
      m.position.set(cx, .2, cz); m.receiveShadow = true; g.add(m);
      var lb = label(r[0], 5, 2.2, 'rgba(52,45,40,.92)', 42); lb.position.set(cx, .95, cz); g.add(lb);
      if (r[6] === 'b') { var bd = new THREE.Mesh(new THREE.BoxGeometry(1.9, .5, 2.1), mt.dark); bd.position.set(cx, .6, cz); bd.castShadow = true; g.add(bd); }
      if (r[6] === 's') { var sf = new THREE.Mesh(new THREE.BoxGeometry(3, .55, 1), mt.dark); sf.position.set(cx, .55, cz - 1.1); g.add(sf); }
      if (r[6] === 'd') { var tb = new THREE.Mesh(new THREE.BoxGeometry(1.6, .7, 2.6), mt.dark); tb.position.set(cx, .55, cz); g.add(tb); }
      if (r[6] === 'k') { var kc = new THREE.Mesh(new THREE.BoxGeometry(wk * .9, .85, .7), mt.dark); kc.position.set(cx, .5, cz - dk * .35); g.add(kc); }
      if (r[6] === 'w') { var wc = new THREE.Mesh(new THREE.BoxGeometry(.9, .5, 1.4), mt.dark); wc.position.set(cx + .6 * fx, .45, cz); g.add(wc); }
      if (r[6] === 't') { var sk = new THREE.Mesh(new THREE.BoxGeometry(2.6, .7, .6), mt.dark); sk.position.set(cx, .55, cz - dk * .32); g.add(sk); }
      if (r[6] === 'e') { [-1, 1].forEach(function (sd) { var sh = new THREE.Mesh(new THREE.BoxGeometry(1.7, 1.6, 1.7), mt.elev); sh.position.set(cx, .85, cz + sd * .95); g.add(sh); }); }
      wall(r[1], r[3], r[2], r[3]); wall(r[1], r[4], r[2], r[4]);
      wall(r[1], r[3], r[1], r[4]); wall(r[2], r[3], r[2], r[4]);
    });
    /* 弧形阳台：front=true 朝南(-z外挑)，false 朝北(+z外挑) */
    function balc(front, x0, x1, dep) {
      var zr = front ? zs(0) : zs(18625);
      var xm = xc(x0, x1), span = wd(x0, x1);
      var s = new THREE.Shape();
      s.moveTo(-span / 2, 0); s.lineTo(span / 2, 0);
      s.quadraticCurveTo(span * .5, dep * .85, 0, dep * 1.0);
      s.quadraticCurveTo(-span * .5, dep * .85, -span / 2, 0);
      var geo = new THREE.ExtrudeGeometry(s, { depth: .26, bevelEnabled: true, bevelThickness: .08, bevelSize: .08, curveSegments: 14 });
      geo.rotateX(Math.PI / 2);
      var grp = new THREE.Group(); var m = new THREE.Mesh(geo, mt.balc); m.receiveShadow = true; grp.add(m);
      if (front) grp.rotation.y = Math.PI;
      grp.position.set(xm, 0, zr); g.add(grp);
    }
    balc(true, 3600, 9190, 2.3);    // 南向客厅大阳台
    balc(true, 17020, 21120, 2.2);  // 南向右次卧阳台
    balc(false, 9190, 13920, 2.2);  // 北向厨房阳台
    balc(false, 0, 3600, 1.6);      // 北向生活阳台
    return g;
  }

  /* ===== 户型展示平台 + 相机过渡 ===== */
  var unitPan = null;   // 进入前保存的全景构图 { pos, tgt }
  function buildUnitSites() {
    var padM = new THREE.MeshStandardMaterial({ color: 0x2c2f31, metalness: 0.3, roughness: 0.7 });
    [[-470, -40], [-470, 170]].forEach(function (sp, i) {
      var gy = terrainH(sp[0], sp[1]);
      var pad = new THREE.Mesh(new THREE.CylinderGeometry(30, 34, 2.4, 48), padM);
      pad.position.set(sp[0], gy + 1.2, sp[1]); pad.receiveShadow = true; scene.add(pad);
      var m = buildUnitModel(i === 1);
      m.position.set(sp[0], gy + 2.4, sp[1]);
      if (i === 0) unitL = m; else unitR = m;
    });
    unitL.visible = unitR.visible = false;
    scene.add(unitL); scene.add(unitR);
  }
  function easeIO(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
  /* 相机丝滑过渡：记录起点/目标位置与目标点，缓动插值（期间禁用控制器） */
  function flyCamera(p, t, dur) {
    camAnim = { t: 0, dur: dur || 1.4, p0: camera.position.clone(), p1: p.clone(),
      q0: controls.target.clone(), q1: t.clone() };
    controls.enabled = false;
  }
  function enterUnit(side) {
    if (curUnit === side) return;
    unitPan = { pos: camera.position.clone(), tgt: controls.target.clone() };
    curUnit = side;
    unitL.visible = side === -1; unitR.visible = side === 1;
    var u = side === -1 ? unitL : unitR, x = u.position.x, z = u.position.z;
    flyCamera(new THREE.Vector3(x, 58, z + 44), new THREE.Vector3(x, 0, z), 1.5);
    info.innerHTML = '<b>' + (side === -1 ? '01 户 · 左户型' : '02 户 · 右户型') + '</b>' +
      '<br><span class="dim">3D 户型俯瞰 · 拖拽旋转 · 按 Esc 或点击空地返回楼栋全景</span>';
    hideTip();
  }
  function exitUnit() {
    if (curUnit === 0) return;
    curUnit = 0; unitL.visible = unitR.visible = false;
    if (unitPan) { flyCamera(unitPan.pos, unitPan.tgt, 1.2); unitPan = null; }
    info.innerHTML = '<b>鸿屿长洲 · 全景沙盘</b>' +
      '<br><span class="dim">天鹅湖 · 两翼高层 · 别墅半岛 · 文化场馆 · 拖拽旋转 · 滚轮缩放 · 点击塔楼楼层查看户型</span>';
  }

  var downX = 0, downY = 0, dragging = false;
  function onDown(e) {
    downX = e.clientX; downY = e.clientY; dragging = false;
  }
  function onMove(e) {
    if (e.buttons) {
      var dx = e.clientX - downX, dy = e.clientY - downY;
      if (dx * dx + dy * dy > 36) dragging = true;
    }
    if (dragging) { hideTip(); canvas.style.cursor = 'grabbing'; return; }
    var h = pick(e);
    var m = h ? h.m : null;
    if (m !== hov) {
      if (hov) style(hov, hov === sel ? 'sel' : 'none');
      hov = m;
      if (hov && hov !== sel) style(hov, 'hov');
    }
    if (m && h) showTip(m, h.point); else hideTip();
    canvas.style.cursor = m ? 'pointer' : 'grab';
  }
  function onUp(e) {
    if (dragging) { dragging = false; return; }
    if (curUnit !== 0) { exitUnit(); return; }
    var h = pick(e);
    if (h && h.m && h.m.userData.side !== undefined) enterUnit(h.m.userData.side);
  }
  function onLeave() {
    if (hov) { style(hov, hov === sel ? 'sel' : 'none'); hov = null; }
    hideTip();
  }

  function resize() {
    var rect = host.getBoundingClientRect();
    var w = Math.max(1, rect.width), h = Math.max(1, rect.height);
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
  }

  function show() {
    init();
    if (!ready) { if (o) o.hidden = true; return; }
    o.hidden = false; running = true;
    info.innerHTML = '<b>鸿屿长洲 · 全景沙盘</b><br><span class="dim">天鹅湖 · 两翼高层 · 别墅半岛 · 文化场馆 · 拖拽旋转 · 滚轮缩放 · 点击塔楼楼层查看户型</span>';
    if (sel) { style(sel, 'none'); sel = null; }
    enter = { t: 0 };
    group.position.y = -drop;
    baseRing.material.opacity = 0;
    resize();
    var last = performance.now();
    (function loop(now) {
      if (!running) return;
      var dt = Math.min(0.05, (now - last) / 1000); last = now;
      if (enter) {
        enter.t = Math.min(1, enter.t + dt * 0.6);
        var u = enter.t - 1, e = 1 + 2.6 * u * u * u + 1.7 * u * u;
        group.position.y = -drop * (1 - e);
        baseRing.material.opacity = 0.5 * Math.min(1, enter.t * 1.6);
        if (enter.t >= 1) enter = null;
      }
      if (camAnim) {
        /* 相机丝滑过渡：缓动插值 position 与 target，完成后恢复控制器 */
        camAnim.t = Math.min(1, camAnim.t + dt / camAnim.dur);
        var ck = easeIO(camAnim.t);
        camera.position.lerpVectors(camAnim.p0, camAnim.p1, ck);
        controls.target.lerpVectors(camAnim.q0, camAnim.q1, ck);
        if (camAnim.t >= 1) { camAnim = null; controls.enabled = true; }
      } else {
        controls.update();
      }
      sunLoop(dt);
      updateSun();
      renderer.render(scene, camera);
      requestAnimationFrame(loop);
    })(performance.now());
  }

  function hide() {
    running = false; enter = null;
    if (o) o.hidden = true;
    hideTip();
  }

  /* 把轨迹表插值到任意日照时刻 h（6–18），返回 {az, el, i} */
  function sunParams(h) {
    var hh = Math.max(6, Math.min(18, h));
    var a = Math.floor(hh), b = Math.min(18, a + 1), f = hh - a;
    var A = SUN_TRACK[a], B = SUN_TRACK[b];
    if (!B) return A;
    return {
      az: A.az + (B.az - A.az) * f,
      el: A.el + (B.el - A.el) * f,
      i:  A.i  + (B.i  - A.i ) * f
    };
  }

  /* 按日照时刻驱动太阳位置与颜色（对应 PDF 日照示意：6:00 朝湖 → 14:00 南向 → 18:00）
     太阳固定在场景世界方位上，影子随时刻转动，正午白亮、晨昏暖橙低角度长影 */
  function updateSun() {
    if (!keyLight) return;
    var cx = 0, cy = 120, cz = 0;               // 场景中心
    var R = 640;
    var p = sunParams(sunH);
    var azR = p.az * Math.PI / 180;            // 方位角：0°=南(+Z)，负值偏东(+X)，正值偏西(-X)
    var elR = p.el * Math.PI / 180;            // 高度角
    keyLight.position.set(
      cx + R * Math.cos(elR) * Math.sin(azR),
      cy + R * Math.sin(elR),
      cz + R * Math.cos(elR) * Math.cos(azR)
    );
    keyLight.target.position.set(cx, cy, cz);
    keyLight.target.updateMatrixWorld();
    /* 随高度角调整强度与色温：晨昏暖橙、正午白亮 */
    var day = Math.max(0, Math.min(1, (p.i - 0.28) / (1.08 - 0.28)));
    keyLight.color.setHex(0xffc890).lerp(new THREE.Color(0xffffff), day);
    keyLight.intensity = 0.45 + 1.15 * day;
    /* 同步可见太阳的位置与颜色：太阳随时刻在空中移动 */
    if (sunBall) {
      sunBall.position.copy(keyLight.position);
      sunBall.material.color.copy(keyLight.color);
      var glow = sunBall.getObjectByName('sunGlow');
      if (glow) glow.material.color.copy(keyLight.color);
    }
  }

  /* 昼夜循环：每帧推进光照时刻，影子随太阳转动 */
  function sunLoop(dt) {
    if (!sunPlaying || sunCur == null) return;
    sunCur += dt * 0.4;                        // 6:00→18:00 约 30s 一轮
    if (sunCur > 18) sunCur = 6;               // 到傍晚后回绕清晨，持续循环
    setSun(sunCur);
  }

  /* 设定当前日照时刻并同步 UI（时间标签/阶段指示器） */
  function setSun(h) {
    sunH = Math.max(6, Math.min(18, h));
    var lbl = document.getElementById('tower-sun');
    if (lbl) lbl.textContent = fmtSun(sunH);
    var led = document.getElementById('tower-sun-led');
    if (led) {
      led.textContent = phaseLabel(sunH);
      led.style.color = phaseColor(sunH);
    }
    /* 同步滑块位置与拇指色温（晨昏暖橙 → 正午白亮） */
    var r = document.getElementById('tower-sun-range');
    if (r) {
      r.value = String(sunH);   // 滑块圆点跟随时间移动
      var p = sunParams(sunH);
      var day = Math.max(0, Math.min(1, (p.i - 0.28) / (1.08 - 0.28)));
      r.style.setProperty('--sun-thumb', '#' + new THREE.Color(0xffc890).lerp(new THREE.Color(0xffffff), day).getHexString());
    }
  }

  function fmtSun(h) {
    var hh = Math.floor(h), mm = Math.round((h - hh) * 60);
    if (mm === 60) { hh += 1; mm = 0; }
    return (hh < 10 ? '0' : '') + hh + ':' + (mm < 10 ? '0' : '') + mm;
  }

  function phaseLabel(h) {
    if (h < 10) return '清晨 · 朝湖';
    if (h < 14) return '上午 · 东北';
    if (h < 17) return '下午 · 南向';
    return '傍晚 · 南向';
  }
  function phaseColor(h) {
    if (h < 10) return '#ff9b66';
    if (h < 14) return '#ffe0a8';
    if (h < 17) return '#ffd27a';
    return '#ff9760';
  }

  function init() {
    if (ready) return;
    if (!window.THREE || !THREE.OrbitControls) return;
    o = document.getElementById('tower-viewer');
    canvas = document.getElementById('tower-canvas');
    info = document.getElementById('tower-info');
    tip = document.getElementById('tower-tip');
    closeBtn = document.getElementById('tower-close');
    host = o ? o.querySelector('.tower-viewer__stage') : null;
    if (!o || !canvas || !host) return;

    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.setSize(canvas.clientWidth || 1, canvas.clientHeight || 1, false);
    renderer.setClearColor(0x000000, 0);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(52, 1, 0.1, 4200);
    camera.position.set(-20, 780, 700);

    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.enablePan = false;
    controls.minDistance = 60;
    controls.maxDistance = 1500;
    controls.maxPolarAngle = Math.PI * 0.46;
    controls.target.set(-60, 40, 0);
    controls.update();

    /* 环境光与补光调低，突出主方向光的明暗对比，使被日照楼层明显 */
    scene.add(new THREE.HemisphereLight(0xeaf5ee, 0x0c1513, 0.5));
    keyLight = new THREE.DirectionalLight(0xffffff, 1.05);
    keyLight.position.set(160, 260, 140);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(4096, 4096);
    keyLight.shadow.camera.near = 20; keyLight.shadow.camera.far = 2000;
    keyLight.shadow.camera.left = -780; keyLight.shadow.camera.right = 780;
    keyLight.shadow.camera.top = 780; keyLight.shadow.camera.bottom = -780;
    keyLight.shadow.bias = -0.0004;
    scene.add(keyLight);
    scene.add(keyLight.target);
    keyLight.target.position.set(0, 40, 0);
    var fill = new THREE.DirectionalLight(0xbcd8cf, 0.22);
    fill.position.set(-180, 100, -160); scene.add(fill);
    var rim = new THREE.PointLight(0xe8d2b4, 0.5, 900);
    rim.position.set(0, 120, 240); scene.add(rim);

    /* 可见太阳：发光球 + 光晕，随日照时刻在空中移动 */
    sunBall = new THREE.Mesh(new THREE.SphereGeometry(16, 32, 32),
      new THREE.MeshBasicMaterial({ color: 0xffc890, fog: false }));
    var sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: makeGlowTex(), color: 0xffc890, transparent: true, opacity: 0.85, depthWrite: false
    }));
    sunGlow.name = 'sunGlow'; sunGlow.scale.set(180, 180, 1);
    sunBall.add(sunGlow);
    scene.add(sunBall);

    ray = new THREE.Raycaster();
    ptr = new THREE.Vector2();

    buildGround();
    buildAll();
    buildEnvironment();
    buildUnitSites();

    canvas.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointerleave', onLeave);
    window.addEventListener('resize', resize);
    window.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && curUnit !== 0) exitUnit();
    });
    if (closeBtn) closeBtn.addEventListener('click', hide);

    /* 日照时间控件：拖动滑块切换到特定时刻，点击播放/暂停昼夜循环 */
    var sunRange = document.getElementById('tower-sun-range');
    var sunPlay = document.getElementById('tower-sun-play');
    if (sunRange) {
      sunRange.min = '6'; sunRange.max = '18'; sunRange.step = 'any'; sunRange.value = '12';
      sunRange.addEventListener('input', function () {
        sunPlaying = false;
        if (sunPlay) sunPlay.textContent = '▶';
        setSun(parseFloat(sunRange.value));
      });
    }
    if (sunPlay) {
      sunPlay.addEventListener('click', function () {
        sunPlaying = !sunPlaying;
        sunPlay.textContent = sunPlaying ? '⏸' : '▶';
        if (sunPlaying) sunCur = sunH;           // 从当前时刻继续循环
      });
    }
    setSun(12);
    updateSun();

    ready = true;
  }

  window.openTowerViewer = function () {
    init();
    if (!ready) { if (window.openDrawer) window.openDrawer(); return; }
    show();
  };
  window.closeTowerViewer = hide;
})();
