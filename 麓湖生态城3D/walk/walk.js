/* ---------------------------------------------------------------------------
 * 麓湖生态城 · 小人漫游（WALK）—— 运行时注入版
 * ---------------------------------------------------------------------------
 * 移植自 luxelakes-sandbox/src/interaction/walk.js 与 src/ui/teleport.js。
 *
 * 为什么是「注入」而不是重新打包：
 *   站点「现代」沙盘与沙盒同源，但经过「全域精细化」配色与体量加工，其源码
 *   不在此机；直接部署沙盒构建会整体回退配色。故以运行时模块形式把漫游能力
 *   挂到既有页面，配色与图元零改动。
 *
 * 与宿主（window.__luxelakes）的约定：
 *   engine   : { persp, controls, scene, renderer, state, onUpdate }
 *   store    : { plots, codeIndex, landmarks, siteOutline, selectedPlots(), state }
 *   voxels   : { groups:{buildings,podiums,...}, buildingFootprints }
 *   c23      : { root, specs }
 *   precincts: { groups }
 *   rig      : { stop(), setTopView(bool) }
 *   hud      : { toast(msg, ms) }
 *
 * 宿主渲染循环只在顶视图分支跳过 controls.update()，故进入漫游时用一层
 * 「闸门」包住 controls.update，避免 OrbitControls 逐帧覆写相机。
 * ------------------------------------------------------------------------ */

/* ============================== 常量 ============================== */

/** 站立面高度：地块 / 建筑体量的基准面 */
const GROUND_Y = 0.24;
/** 世界单位 → 米（1 单位 ≈ 3.3m） */
const UNIT = 3.3;
/** 小人身高 ≈1.72m、眼高 ≈1.6m（世界单位） */
const AVATAR_H = 1.72 / UNIT;
const EYE_OFFSET = 1.6 / UNIT;
/** 身体半径（≈1.2m），用于碰撞与边界退让 */
const BODY_RADIUS = 0.36;
/** 步行基础速度（世界单位/秒），即第 1 档 */
const SPEED_WALK = 1.9;
/** 加速档位：共 3 档，依次翻倍 —— 1.0× / 2.0× / 4.0×（行走与飞行共用） */
const GEAR_MULT = [1, 2, 4];
const GEAR_MAX = GEAR_MULT.length;
/** 速度平滑（越大越跟手） */
const ACCEL = 13;
/** 空中操控衰减 */
const AIR_CONTROL = 0.45;
/** 键盘转身速度（rad/s） */
const TURN_SPEED = 1.9;
/** 鼠标灵敏度（rad/px） */
const LOOK_SENS = 0.0021;
/** 触屏环视灵敏度（rad/px）：指尖精度低于鼠标，取略大值才跟手 */
const TOUCH_LOOK_SENS = 0.0058;
const PITCH_LIMIT = Math.PI * 0.47;

/** 是否触屏设备：用于启用虚拟摇杆 / 拖动环视，并跳过指针锁定 */
const IS_TOUCH =
  typeof window !== 'undefined' &&
  (('ontouchstart' in window) || (navigator.maxTouchPoints || 0) > 0);

/** 跳跃：重力（9.8 m/s² → 世界单位）、起跳初速 */
const GRAVITY = 9.8 / UNIT;
const JUMP_SPEED = 1.72;

/** 飞行：巡航速度（再乘当前档位）/ 升降速度 / 升限 */
const SPEED_FLY = 5.0;
const FLY_RISE = 2.0;
const MAX_ALT = 160;

/** 第三人称：相机距离 / 抬高 / 最近距离 / 相机碰撞半径 / 避让采样步数 */
const TP_DIST = 1.55;
const TP_LIFT = 0.26;
const TP_MIN_DIST = 0.42;
const CAM_RADIUS = 0.12;
const TP_STEPS = 14;

/** 漫游时临时调整的相机 / 雾参数（退出后完整还原） */
const FOV = 62;
const NEAR = 0.22;
const FOG_NEAR = 90;
const FOG_FAR = 1900;

/** 距离项目边界的最小退让（世界单位） */
const EDGE_MARGIN = 0.5;
/** 碰撞网格单元尺寸 */
const CELL = 12;
/** 单帧推进的最大步长（切分子步，防止高速穿透薄墙） */
const SUB_STEP = 0.25;
/** 矮于该高度的体量不参与碰撞（屋顶 / 小品 / 树） */
const MIN_BLOCK_HEIGHT = 1.1;
/** 单帧最大步进时长（秒），避免切后台回来瞬移 */
const DT_MAX = 0.1;

const MOVE_CODES = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'KeyQ', 'KeyE', 'Space', 'KeyC',
  'ControlLeft', 'ControlRight',
]);

/** 数字键直选档位 */
const GEAR_KEYS = { Digit1: 1, Numpad1: 1, Digit2: 2, Numpad2: 2, Digit3: 3, Numpad3: 3 };

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/** 纯绕 Y 轴四元数 → 角度 */
function yawOf(q) {
  return Math.atan2(2 * (q.w * q.y + q.x * q.z), 1 - 2 * (q.y * q.y + q.x * q.x));
}

/** 最短角度差（-π..π） */
function angDelta(from, to) {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/* ======================= 几何：点包含 / 边界距离 ======================= */

function pointInRing(x, z, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const zi = ring[i][1];
    const xj = ring[j][0];
    const zj = ring[j][1];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

function pointInPolygon(x, z, polygon) {
  if (!polygon || !polygon.outer || !pointInRing(x, z, polygon.outer)) return false;
  const holes = polygon.holes || [];
  for (let i = 0; i < holes.length; i++) {
    if (holes[i] && holes[i].length >= 3 && pointInRing(x, z, holes[i])) return false;
  }
  return true;
}

function distToSegment(x, z, ax, az, bx, bz) {
  const dx = bx - ax;
  const dz = bz - az;
  const len2 = dx * dx + dz * dz;
  let t = len2 > 0 ? ((x - ax) * dx + (z - az) * dz) / len2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(x - (ax + dx * t), z - (az + dz * t));
}

function distToRing(x, z, ring) {
  let min = Infinity;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const d = distToSegment(x, z, ring[j][0], ring[j][1], ring[i][0], ring[i][1]);
    if (d < min) min = d;
  }
  return min;
}

/* ========================= 等待宿主就绪 ========================= */

function waitFor(fn, timeout = 90000, interval = 120) {
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    const tick = () => {
      let v = null;
      try {
        v = fn();
      } catch (e) {
        v = null;
      }
      if (v) return resolve(v);
      if (Date.now() - t0 > timeout) return reject(new Error('walk: 等待宿主就绪超时'));
      setTimeout(tick, interval);
    };
    tick();
  });
}

/* ==================== three 构造器运行时桥 ==================== */

/**
 * 站点构建把 three 内联在 bundle 里，外部拿不到模块导出。three 的对象全部带
 * `isXxx` 标志位并靠鸭子类型互相识别，因此从场景中已存在的实例回溯原型即可
 * 拿回可用构造器，新建对象可直接加入同一场景、被同一渲染器绘制。
 * 材质按「越接近标准 PBR 越优先」挑一个，颜色 / 粗糙度参数在各材质上通用。
 */
const MAT_ORDER = ['MeshStandardMaterial', 'MeshLambertMaterial', 'MeshPhongMaterial', 'MeshBasicMaterial'];

function bridgeThree(L) {
  const scene = L.engine.scene;
  let geoBox = null;
  let meshPlain = null;
  let meshAny = null;
  let matStd = null;

  scene.traverse((o) => {
    if (!geoBox && o.geometry && o.geometry.type === 'BoxGeometry') geoBox = o.geometry;
    if (!meshAny && o.isMesh) meshAny = o;
    if (!meshPlain && o.isMesh && !o.isInstancedMesh) meshPlain = o;
    if (!matStd && o.material && MAT_ORDER.includes(o.material.type)) {
      const cur = MAT_ORDER.indexOf(matStd ? matStd.type : '');
      if (!matStd || MAT_ORDER.indexOf(o.material.type) < cur) matStd = o.material;
    }
  });

  const Mesh = meshPlain
    ? meshPlain.constructor
    : meshAny && meshAny.isInstancedMesh
      ? Object.getPrototypeOf(Object.getPrototypeOf(meshAny)).constructor
      : null;
  const voxGroup = L.voxels && L.voxels.groups && L.voxels.groups.buildings;

  const T = {
    Vector3: scene.position.constructor,
    Euler: scene.rotation.constructor,
    Quaternion: scene.quaternion.constructor,
    Matrix4: scene.matrixWorld.constructor,
    // Group 本质上只是可挂子节点的 Object3D：优先复用场景里已有的组构造器，
    // 否则退到 Mesh 的父类（three 里 Mesh 直接继承 Object3D），保证不会误取到 Light。
    Group: (voxGroup && voxGroup.constructor) || (Mesh ? Object.getPrototypeOf(Mesh) : null),
    Mesh,
    BoxGeometry: geoBox ? geoBox.constructor : null,
    Material: matStd ? matStd.constructor : null,
  };

  T.ok = !!(T.Vector3 && T.Quaternion && T.Matrix4 && T.Group && T.Mesh && T.BoxGeometry && T.Material);
  return T;
}

/** 体素小人：正面朝 −Z，脚底在 y = 0（尺寸按米给出，内部换算成世界单位） */
function makeAvatar(T) {
  const group = new T.Group();
  group.name = 'walk-avatar';
  const q = (v) => v / UNIT;
  const part = (w, h, d, px, py, pz, color) => {
    const mesh = new T.Mesh(
      new T.BoxGeometry(q(w), q(h), q(d)),
      new T.Material({ color, roughness: 0.86, metalness: 0.02, flatShading: true })
    );
    mesh.position.set(q(px), q(py), q(pz));
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.frustumCulled = false;
    group.add(mesh);
  };

  part(0.17, 0.8, 0.19, -0.115, 0.4, 0, '#3d4756'); // 左腿
  part(0.17, 0.8, 0.19, 0.115, 0.4, 0, '#3d4756'); // 右腿
  part(0.44, 0.62, 0.25, 0, 1.11, 0, '#d9614c'); // 躯干
  part(0.13, 0.56, 0.17, -0.285, 1.1, 0, '#c1503f'); // 左臂
  part(0.13, 0.56, 0.17, 0.285, 1.1, 0, '#c1503f'); // 右臂
  part(0.27, 0.27, 0.27, 0, 1.555, 0, '#e9c9a6'); // 头
  part(0.29, 0.1, 0.29, 0, 1.72, 0, '#2f3a46'); // 帽顶
  part(0.29, 0.14, 0.05, 0, 1.62, -0.13, '#2f3a46'); // 帽檐（提示正面）
  return group;
}
/* ============================ 主体 ============================ */

function createWalkMode(L) {
  const engine = L.engine;
  const store = L.store;
  const { persp, controls, scene, renderer } = engine;
  const dom = renderer.domElement;
  const T = bridgeThree(L);

  const rig = L.rig || null;
  const towers = (L.c23 && L.c23.root) || null;
  const towerSpecs = (L.c23 && L.c23.specs) || null;

  const hint = (msg) => {
    if (L.hud && typeof L.hud.toast === 'function') L.hud.toast(msg, 1500);
  };

  const hudEl = document.getElementById('walk-hud');
  const posEl = document.getElementById('walk-pos');
  const modeEl = document.getElementById('walk-mode');
  const speedEl = document.getElementById('walk-speed');
  const viewBtn = document.getElementById('walk-view');
  const flyBtn = document.getElementById('walk-fly');
  const gearBtn = document.getElementById('walk-gear');

  let active = false;
  let saved = null;

  let colliders = [];
  let grid = new Map();
  let built = false;

  let x = 0;
  let z = 0;
  let feetY = GROUND_Y;
  let yaw = 0;
  let pitch = 0;
  let vx = 0;
  let vz = 0;
  let vy = 0;
  let onGround = true;
  let jumpQueued = false;
  let bobPhase = 0;
  /** 当前档位（1..GEAR_MAX）与对应倍率 */
  let gear = 1;
  let speedScale = GEAR_MULT[0];
  let wheelAcc = 0;
  let readoutFrame = 0;
  let where = '';

  /** 'first' | 'third' */
  let view = 'first';
  let flying = false;

  let avatar = null;
  let avatarYaw = 0;
  let blob = null;

  const keys = new Set();
  let dragging = false;
  /** 覆盖面板（如传送）打开期间主动释放了鼠标锁定，此时丢锁不算退出漫游 */
  let lockPaused = false;

  /* ---- 触屏输入：左摇杆移动（模拟量）+ 右半屏拖动环视 ---- */
  /** 摇杆位移向量：x 右为正，z 前为正，模长 ≤1 即速度倍率 */
  const pad = { x: 0, z: 0 };
  /** 由 createJoystick() 注入，用于退出漫游时回中 */
  let padReset = null;
  /** 正在拖动环视的触点 id（null 表示无） */
  let lookTouchId = null;
  let lookX = 0;
  let lookY = 0;

  /** 指针锁定容错：无头 / 权限受限环境下会抛错或被拒绝，忽略即可 */
  function requestLock() {
    // 触屏设备没有「指针」，锁定只会失败；环视由 touchmove 接管
    if (IS_TOUCH || !active || !dom.requestPointerLock) return;
    try {
      const r = dom.requestPointerLock();
      if (r && typeof r.catch === 'function') r.catch(() => {});
    } catch (e) {
      /* ignore */
    }
  }

  function releaseLock() {
    try {
      if (document.pointerLockElement === dom && document.exitPointerLock) document.exitPointerLock();
    } catch (e) {
      /* ignore */
    }
  }

  const outline = store.siteOutline && store.siteOutline.length > 4 ? store.siteOutline : null;

  /* ---------------------------------------------------------------------
   * 碰撞体：把建筑体量烘成「旋转矩形 + 顶面高度」，再用均匀网格索引。
   * 两路数据源互补后按空间哈希去重：
   *   1) 场景里的 InstancedMesh（三维实体的权威来源）；
   *   2) voxels.buildingFootprints（体量足迹）。
   * ------------------------------------------------------------------- */
  function buildColliders() {
    colliders = [];
    const seen = new Set();
    const m = new T.Matrix4();
    const p = new T.Vector3();
    const q = new T.Quaternion();
    const s = new T.Vector3();

    const addRect = (cx, cz, hw, hd, rot, bottom, top) => {
      if (!(hw > 0.05 && hd > 0.05)) return;
      if (!(top > bottom + MIN_BLOCK_HEIGHT)) return; // 太矮：屋顶 / 小品 / 树
      const key = `${Math.round(cx * 4)},${Math.round(cz * 4)},${Math.round(hw * 4)},${Math.round(hd * 4)},${Math.round(top * 4)}`;
      if (seen.has(key)) return;
      seen.add(key);
      colliders.push({ x: cx, z: cz, hw, hd, cos: Math.cos(rot), sin: Math.sin(rot), top });
    };

    const vox = L.voxels || {};
    const vg = vox.groups || {};
    const roots = [vg.buildings, vg.podiums];
    const pg = L.precincts && L.precincts.groups;
    if (pg) {
      if (Array.isArray(pg)) roots.push(...pg);
      else if (pg.isObject3D) roots.push(pg);
      else if (typeof pg === 'object') roots.push(...Object.values(pg).filter((v) => v && v.isObject3D));
    }

    /**
     * 体量的世界包围盒由「实例矩阵 × 几何本地包围盒」得出，这样既能处理以原点
     * 为中心的方盒（现代沙盘），也能处理底面贴地、向上长高的体素块（体素沙盘）。
     */
    const localBox = (o) => {
      const g = o.geometry;
      if (!g) return null;
      if (!g.boundingBox && typeof g.computeBoundingBox === 'function') g.computeBoundingBox();
      return g.boundingBox || null;
    };

    /**
     * 体素沙盘里的「墙体」不是一整块，而是一柱一柱的单体素（VS 见 world.VS）。
     * 单块只有 ~1 单位高，矮于 MIN_BLOCK_HEIGHT，直接丢弃会让整站没有碰撞。
     * 因此这里把矮于阈值的小块按 XZ 列聚合：同一列的体素合并成一根柱子，
     * 柱高（顶 - 底）超过阈值才算作可阻挡的墙体。这样屋顶挑檐等薄板仍被忽略。
     */
    const colCell = (() => {
      const vs = (L.world && L.world.VS) || (L.voxels && L.voxels.VS) || 1;
      return Math.max(0.5, Math.abs(vs) || 1);
    })();
    const columns = new Map();

    roots.forEach((root) => {
      if (!root || !root.traverse) return;
      root.updateMatrixWorld(true);
      root.traverse((o) => {
        if (!o.isInstancedMesh) return;
        const bb = localBox(o);
        if (!bb || !bb.min || !bb.max) return;
        const lcx = (bb.min.x + bb.max.x) / 2;
        const lcy = (bb.min.y + bb.max.y) / 2;
        const lcz = (bb.min.z + bb.max.z) / 2;
        const lhx = (bb.max.x - bb.min.x) / 2;
        const lhy = (bb.max.y - bb.min.y) / 2;
        const lhz = (bb.max.z - bb.min.z) / 2;

        for (let i = 0; i < o.count; i++) {
          o.getMatrixAt(i, m);
          m.premultiply(o.matrixWorld);
          m.decompose(p, q, s);
          const rot = yawOf(q);
          const rc = Math.cos(rot);
          const rs = Math.sin(rot);
          // 本地中心（含几何自带平移）随实例缩放、绕 Y 旋转后落到世界坐标
          const ox = lcx * s.x;
          const oy = lcy * s.y;
          const oz = lcz * s.z;
          const cx = p.x + ox * rc + oz * rs;
          const cz = p.z - ox * rs + oz * rc;
          const cy = p.y + oy;
          const hh = Math.abs(lhy * s.y);
          if (hh * 2 < MIN_BLOCK_HEIGHT) {
            // 窗框 / 栏杆 / 单层体素：先并入所在列，稍后按柱高统一判定
            const key = `${Math.round(cx / colCell)}|${Math.round(cz / colCell)}`;
            const col = columns.get(key);
            if (col) {
              if (cy - hh < col.bottom) col.bottom = cy - hh;
              if (cy + hh > col.top) col.top = cy + hh;
            } else {
              columns.set(key, { x: cx, z: cz, bottom: cy - hh, top: cy + hh });
            }
            continue;
          }
          addRect(cx, cz, Math.abs(lhx * s.x), Math.abs(lhz * s.z), rot, cy - hh, cy + hh);
        }
      });
    });

    // 列的碰撞面用整格宽高，相邻列无缝拼接成一堵墙
    columns.forEach((c) => {
      addRect(c.x, c.z, colCell / 2, colCell / 2, 0, c.bottom, c.top);
    });


    const fps = vox.buildingFootprints;
    if (Array.isArray(fps)) {
      for (const f of fps) {
        if (!f || !Number.isFinite(f.x) || !Number.isFinite(f.z)) continue;
        const bottom = Number.isFinite(f.y) ? f.y : GROUND_Y;
        addRect(f.x, f.z, Math.abs(f.w) / 2, Math.abs(f.d) / 2, f.rot || 0, bottom, bottom + Math.abs(f.h));
      }
    }

    // C23 四栋塔楼：实例过于细碎，改用整栋占地近似，高度视为不可翻越
    if (towers && towers.children && towers.children.length) {
      towers.children.forEach((g, i) => {
        const spec = towerSpecs && towerSpecs[i];
        if (!spec) return;
        const sc = Math.abs(g.scale.x) || 0.05688;
        addRect(
          g.position.x,
          g.position.z,
          (spec.width / 2) * sc * 1.2,
          (spec.depth / 2) * sc * 1.2,
          g.rotation.y,
          GROUND_Y,
          1e4 // 塔楼很高：想飞过去必须真的爬升
        );
      });
    }

    grid = new Map();
    colliders.forEach((c, idx) => {
      const r = Math.hypot(c.hw, c.hd) + BODY_RADIUS;
      const i0 = Math.floor((c.x - r) / CELL);
      const i1 = Math.floor((c.x + r) / CELL);
      const j0 = Math.floor((c.z - r) / CELL);
      const j1 = Math.floor((c.z + r) / CELL);
      for (let i = i0; i <= i1; i++) {
        for (let j = j0; j <= j1; j++) {
          const k = i * 100000 + j;
          let arr = grid.get(k);
          if (!arr) grid.set(k, (arr = []));
          arr.push(idx);
        }
      }
    });

    built = true;
  }

  function insideSite(px, pz) {
    if (!outline) return true;
    if (!pointInPolygon(px, pz, { outer: outline })) return false;
    return distToRing(px, pz, outline) > EDGE_MARGIN;
  }

  /**
   * 是否撞到建筑体量。
   * @param atY 脚底高度：低于体量顶面才会被挡，于是飞天可以越过屋顶
   */
  function rectHit(px, pz, atY, radius) {
    const arr = grid.get(Math.floor(px / CELL) * 100000 + Math.floor(pz / CELL));
    if (!arr) return null;
    for (let i = 0; i < arr.length; i++) {
      const c = colliders[arr[i]];
      if (c.top <= atY + 0.05) continue;
      const dx = px - c.x;
      const dz = pz - c.z;
      const u = dx * c.cos - dz * c.sin;
      const v = dx * c.sin + dz * c.cos;
      if (Math.abs(u) < c.hw + radius && Math.abs(v) < c.hd + radius) return c;
    }
    return null;
  }

  function blocked(px, pz, atY = GROUND_Y, radius = BODY_RADIUS) {
    if (!insideSite(px, pz)) return true;
    return !!rectHit(px, pz, atY, radius);
  }

  /* --------------------------- 小人 --------------------------- */

  function ensureAvatar() {
    if (avatar) return;
    if (T.ok) {
      avatar = makeAvatar(T);
      scene.add(avatar);
    }
    if (T.ok) {
      // 落地投影：用极薄的方法块替代圆片，避免依赖页面不一定有的几何体类型
      blob = new T.Mesh(
        new T.BoxGeometry(0.32, 0.006, 0.32),
        new T.Material({
          color: '#000000',
          roughness: 1,
          metalness: 0,
          transparent: true,
          opacity: 0.3,
          depthWrite: false,
        })
      );
      blob.frustumCulled = false;
      blob.renderOrder = 2;
      scene.add(blob);
    }
  }

  function syncAvatar(dt, moving) {
    if (!avatar) return;
    avatar.visible = active && view === 'third';
    if (blob) blob.visible = active;

    avatar.position.set(x, feetY, z);
    avatar.rotation.y = avatarYaw;
    avatar.rotation.x = flying ? clamp(-(vx + vz) * 0.02, -0.22, 0.22) : 0;

    if (moving) {
      const want = Math.atan2(-vx, -vz);
      avatarYaw += angDelta(avatarYaw, want) * (1 - Math.exp(-12 * dt));
    }

    if (blob) {
      // 离地越高越淡越小
      const k = clamp(1 - Math.max(0, feetY - GROUND_Y) / 3.2, 0.18, 1);
      blob.position.set(x, GROUND_Y + 0.012, z);
      blob.scale.setScalar(k);
      blob.material.opacity = 0.3 * k;
    }
  }

  /* --------------------------- 出生点 --------------------------- */

  /** 螺旋向外找一块既在场地内、又不被建筑占用的空地 */
  function findOpen(px, pz) {
    if (!blocked(px, pz)) return [px, pz];
    for (let step = 1; step <= 90; step++) {
      const r = step * 1.5;
      for (let a = 0; a < 18; a++) {
        const t = (a / 18) * Math.PI * 2;
        const nx = px + Math.cos(t) * r;
        const nz = pz + Math.sin(t) * r;
        if (!blocked(nx, nz)) return [nx, nz];
      }
    }
    return [px, pz];
  }

  /** 兜底出生点：离场地轮廓形心最近的地名（通常是可步行区域） */
  function fallbackSpot() {
    let cx = 0;
    let cz = 0;
    if (outline) {
      outline.forEach(([px, pz]) => {
        cx += px / outline.length;
        cz += pz / outline.length;
      });
    }
    let best = [cx, cz];
    let bd = Infinity;
    (store.landmarks || []).forEach((lm) => {
      const d = Math.hypot(lm.x - cx, lm.z - cz);
      if (d < bd) {
        bd = d;
        best = [lm.x, lm.z];
      }
    });
    return best;
  }

  function resolveSpawn(spot) {
    let sx;
    let sz;
    if (spot && Number.isFinite(spot.x) && Number.isFinite(spot.z)) {
      sx = spot.x;
      sz = spot.z;
    } else {
      const sel = typeof store.selectedPlots === 'function' ? store.selectedPlots()[0] : null;
      const t = controls.target;
      if (sel && sel.center) {
        [sx, sz] = sel.center;
      } else if (t && Math.hypot(t.x, t.z) > 40 && insideSite(t.x, t.z)) {
        [sx, sz] = [t.x, t.z]; // 跟着上帝视角在看的地方落地
      } else {
        [sx, sz] = fallbackSpot();
      }
    }
    return findOpen(sx, sz);
  }

  /* --------------------------- 传送 --------------------------- */

  /**
   * 瞬移到目标坐标（就地传送，不改变视角与档位）。
   * · 落点用「螺旋找空地」避让建筑，保证不会卡在楼里；
   * · 步行时贴地，飞行时保持当前高度，若该点被体量挡住则抬到屋顶之上。
   * @returns {{x:number, z:number, y:number}|null} 实际落点
   */
  function teleport(target) {
    if (!active || !target) return null;
    if (!Number.isFinite(target.x) || !Number.isFinite(target.z)) return null;
    if (!built) buildColliders();

    const [sx, sz] = findOpen(target.x, target.z);
    x = sx;
    z = sz;
    vx = 0;
    vz = 0;
    vy = 0;
    bobPhase = 0;

    if (flying) {
      const hit = rectHit(sx, sz, feetY, BODY_RADIUS);
      if (hit) feetY = Math.min(MAX_ALT, hit.top + 0.4);
      onGround = feetY <= GROUND_Y + 1e-3;
    } else {
      feetY = GROUND_Y;
      onGround = true;
    }

    avatarYaw = yaw;
    syncAvatar(0, false);
    persp.position.set(x, feetY + EYE_OFFSET, z);
    persp.rotation.set(pitch, yaw, 0, 'YXZ');

    where = target.name || '';
    hint(`已传送到「${target.name || '目标点'}」${target.code ? ` · ${target.code}` : ''}`);
    return { x, z, y: feetY };
  }

  /* --------------------------- HUD --------------------------- */

  function syncHud() {
    if (modeEl) modeEl.textContent = `${view === 'third' ? '第三人称' : '第一人称'} · ${flying ? '飞行' : '步行'}`;
    if (speedEl) speedEl.textContent = `${gear}/${GEAR_MAX} · ${speedScale.toFixed(2)}×`;
    if (gearBtn) {
      gearBtn.textContent = `加速档 ${gear}/${GEAR_MAX} · ${speedScale.toFixed(2)}×`;
      gearBtn.classList.toggle('on', gear > 1);
    }
    if (viewBtn) {
      viewBtn.textContent = view === 'third' ? '第一人称 · V' : '第三人称 · V';
      viewBtn.classList.toggle('on', view === 'third');
    }
    if (flyBtn) {
      flyBtn.textContent = flying ? '落地 · F' : '飞行 · F';
      flyBtn.classList.toggle('on', flying);
    }
    document.body.classList.toggle('walk-third', view === 'third');
    document.body.classList.toggle('walk-fly', flying);
  }

  /* --------------------------- 状态切换 --------------------------- */

  function setView(next) {
    view = next;
    if (view === 'third') avatarYaw = yaw;
    syncHud();
    hint(view === 'third' ? '第三人称视角 · 相机跟随小人' : '第一人称视角');
  }

  /** 直接选档（1..3） */
  function setGear(next) {
    gear = clamp(Math.round(next), 1, GEAR_MAX);
    speedScale = GEAR_MULT[gear - 1];
    syncHud();
    hint(`加速档 ${gear}/${GEAR_MAX} · ${speedScale.toFixed(2)}×`);
  }

  /** 升 / 降档，越界时循环（3 档再升回 1 档） */
  function cycleGear(delta = 1) {
    const next = gear + delta;
    setGear(next > GEAR_MAX ? 1 : next < 1 ? GEAR_MAX : next);
  }

  function setFlying(next) {
    flying = next;
    vy = 0;
    onGround = feetY <= GROUND_Y + 1e-3;
    syncHud();
    hint(flying ? '起飞 · SPACE / C 升降，SHIFT / 滚轮 切档' : '已落地');
  }

  /* --------------------------- 输入 --------------------------- */

  /** 焦点在输入框里时（例如传送面板搜索），按键交给输入框 */
  function typingInField(e) {
    const t = e.target;
    if (!t || !t.tagName) return false;
    const tag = t.tagName.toUpperCase();
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t.isContentEditable;
  }

  function onKeyDown(e) {
    if (!active || typingInField(e)) return;
    if (e.code === 'KeyV' && !e.repeat) {
      e.preventDefault();
      setView(view === 'third' ? 'first' : 'third');
      return;
    }
    if (e.code === 'KeyF' && !e.repeat) {
      e.preventDefault();
      setFlying(!flying);
      return;
    }
    if (GEAR_KEYS[e.code]) {
      e.preventDefault();
      if (!e.repeat) setGear(GEAR_KEYS[e.code]);
      return;
    }
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
      e.preventDefault();
      if (!e.repeat) cycleGear(1);
      return;
    }
    if (!MOVE_CODES.has(e.code)) return;
    if (e.code === 'Space' && !e.repeat) jumpQueued = true;
    keys.add(e.code);
    e.preventDefault();
  }

  function onKeyUp(e) {
    if (!active) return;
    keys.delete(e.code);
    if (!typingInField(e) && MOVE_CODES.has(e.code)) e.preventDefault();
  }

  function onBlur() {
    keys.clear();
    dragging = false;
    wheelAcc = 0;
    resetTouchInput();
  }

  function onPointerDown(e) {
    if (!active) return;
    // 触摸派生出的 pointer 事件交给 touchstart/touchmove 处理，避免与鼠标逻辑双重响应
    if (e && e.pointerType === 'touch') return;
    dragging = true;
    if (document.pointerLockElement !== dom) requestLock();
  }

  function onPointerUp() {
    dragging = false;
  }

  function onPointerMove(e) {
    if (!active) return;
    if (e && e.pointerType === 'touch') return;
    if (document.pointerLockElement !== dom && !dragging) return;
    yaw -= (e.movementX || 0) * LOOK_SENS;
    pitch = clamp(pitch - (e.movementY || 0) * LOOK_SENS, -PITCH_LIMIT, PITCH_LIMIT);
  }

  /* ---- 触屏：单指在画面上拖动 = 环视（替代指针锁定位移） ---- */

  function onTouchStart(e) {
    if (!active) return;
    // 已有触点在做环视时，忽略后续手指（摇杆不在画面上，由自身捕获）
    if (lookTouchId === null && e.changedTouches.length) {
      const t = e.changedTouches[0];
      lookTouchId = t.identifier;
      lookX = t.clientX;
      lookY = t.clientY;
      dragging = true;
    }
    if (e.cancelable) e.preventDefault();
  }

  function onTouchMove(e) {
    if (!active || lookTouchId === null) return;
    let t = null;
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === lookTouchId) t = e.changedTouches[i];
    }
    if (!t) return;
    const dx = t.clientX - lookX;
    const dy = t.clientY - lookY;
    lookX = t.clientX;
    lookY = t.clientY;
    yaw -= dx * TOUCH_LOOK_SENS;
    pitch = clamp(pitch - dy * TOUCH_LOOK_SENS, -PITCH_LIMIT, PITCH_LIMIT);
    if (e.cancelable) e.preventDefault();
  }

  function onTouchEnd(e) {
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === lookTouchId) {
        lookTouchId = null;
        dragging = false;
      }
    }
  }

  /** 退出漫游 / 失焦时把触屏输入归零，避免「残留推力」把小人一直往前带 */
  function resetTouchInput() {
    lookTouchId = null;
    dragging = false;
    pad.x = 0;
    pad.z = 0;
    if (padReset) padReset();
  }

  /**
   * 虚拟摇杆 + 跳跃键（仅触屏设备创建）。
   * 摇杆用 Pointer Events 实现：按下即 setPointerCapture，手指滑出圆盘仍持续跟手。
   */
  function createTouchControls() {
    if (!IS_TOUCH || !hudEl) return;
    document.body.classList.add('walk-touch');

    const padEl = document.createElement('div');
    padEl.className = 'walk-pad';
    padEl.setAttribute('aria-hidden', 'true');
    const knobEl = document.createElement('div');
    knobEl.className = 'walk-pad-knob';
    padEl.appendChild(knobEl);
    hudEl.appendChild(padEl);

    let pid = null;

    const reset = () => {
      pad.x = 0;
      pad.z = 0;
      knobEl.style.transform = 'translate(-50%, -50%)';
    };

    const apply = (e) => {
      const r = padEl.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const max = Math.max(1, r.width / 2 - 8);
      let ox = e.clientX - cx;
      let oy = e.clientY - cy;
      const len = Math.hypot(ox, oy);
      if (len > max) {
        ox = (ox / len) * max;
        oy = (oy / len) * max;
      }
      knobEl.style.transform = `translate(calc(-50% + ${ox}px), calc(-50% + ${oy}px))`;
      pad.x = ox / max;
      pad.z = -oy / max; // 上推 = 前进
    };

    padEl.addEventListener('pointerdown', (e) => {
      if (!active) return;
      pid = e.pointerId;
      try {
        padEl.setPointerCapture(pid);
      } catch (_) {
        /* ignore */
      }
      apply(e);
      if (e.cancelable) e.preventDefault();
    });
    padEl.addEventListener('pointermove', (e) => {
      if (!active || pid === null || e.pointerId !== pid) return;
      apply(e);
      if (e.cancelable) e.preventDefault();
    });
    const endPad = (e) => {
      if (pid === null || (e && e.pointerId !== pid)) return;
      pid = null;
      reset();
    };
    padEl.addEventListener('pointerup', endPad);
    padEl.addEventListener('pointercancel', endPad);
    padEl.addEventListener('lostpointercapture', endPad);

    padReset = reset;

    // 跳跃 / 飞行上升：飞行时按住等效 SPACE，步行时按一下触发跳跃
    const jumpEl = document.createElement('button');
    jumpEl.type = 'button';
    jumpEl.className = 'ghost walk-jump';
    jumpEl.textContent = '跳跃';
    hudEl.appendChild(jumpEl);

    const onJumpDown = (e) => {
      if (!active) return;
      if (flying) keys.add('Space');
      else jumpQueued = true;
      if (e.cancelable) e.preventDefault();
    };
    const onJumpUp = () => keys.delete('Space');
    jumpEl.addEventListener('pointerdown', onJumpDown);
    jumpEl.addEventListener('pointerup', onJumpUp);
    jumpEl.addEventListener('pointercancel', onJumpUp);
    jumpEl.addEventListener('pointerleave', onJumpUp);
  }

  /** 滚轮切档：向上加速、向下减速（累积到阈值才切，避免一次滚动跳档） */
  function onWheel(e) {
    if (!active) return;
    e.preventDefault();
    wheelAcc += e.deltaY;
    if (Math.abs(wheelAcc) < 40) return;
    const dir = wheelAcc < 0 ? 1 : -1;
    wheelAcc = 0;
    cycleGear(dir);
  }

  function onLockChange() {
    if (!active) return;
    // 已重新锁定：解除「面板暂停」标记
    if (document.pointerLockElement === dom) {
      lockPaused = false;
      return;
    }
    // 面板期间主动释放的锁定，不算退出
    if (lockPaused) return;
    // Esc 会先退出鼠标锁定：此时同步退出漫游，符合「ESC 退出」的直觉
    exit();
  }

  /** 覆盖面板打开：释放鼠标锁定但保持漫游（否则指针锁定下无法点选面板） */
  function pauseLook() {
    lockPaused = true;
    keys.clear();
    dragging = false;
    releaseLock();
  }

  /** 覆盖面板关闭：尝试重新锁定；被浏览器拒绝时，点一下画面即可恢复 */
  function resumeLook() {
    if (document.pointerLockElement === dom) {
      lockPaused = false;
      return;
    }
    requestLock();
  }

  const onViewClick = () => {
    if (active) setView(view === 'third' ? 'first' : 'third');
  };
  const onFlyClick = () => {
    if (active) setFlying(!flying);
  };
  const onGearClick = () => {
    if (active) cycleGear(1);
  };

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  dom.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointermove', onPointerMove);
  dom.addEventListener('wheel', onWheel, { passive: false });
  document.addEventListener('pointerlockchange', onLockChange);
  dom.addEventListener('touchstart', onTouchStart, { passive: false });
  dom.addEventListener('touchmove', onTouchMove, { passive: false });
  dom.addEventListener('touchend', onTouchEnd);
  dom.addEventListener('touchcancel', onTouchEnd);
  if (viewBtn) viewBtn.addEventListener('click', onViewClick);
  if (flyBtn) flyBtn.addEventListener('click', onFlyClick);
  if (gearBtn) gearBtn.addEventListener('click', onGearClick);

  // 触屏设备：注入虚拟摇杆与跳跃键（元素常驻 HUD，随 HUD 一并显隐）
  createTouchControls();

  /* ---- 相机闸门 --------------------------------------------------------
   * 宿主渲染循环每帧调用 controls.update()（仅顶视图分支跳过）。漫游期间相机
   * 由 walk 独占，这里用一层闸门让 controls.update() 空转，退出后自动恢复。
   * ------------------------------------------------------------------- */
  const origControlsUpdate = typeof controls.update === 'function' ? controls.update : null;
  if (origControlsUpdate) {
    controls.update = function (...args) {
      if (active) return;
      return origControlsUpdate.apply(this, args);
    };
  }

  /* --------------------------- 逐帧 --------------------------- */

  function update(dt) {
    if (!active) return;
    const step = Math.min(dt, DT_MAX);

    // 与顶视图互斥（例如从外部切换了 TOP VIEW）
    if (engine.state.topview) {
      exit();
      return;
    }

    // ---- 转身 ----------------------------------------------------------
    let turn = 0;
    if (keys.has('KeyQ')) turn += 1;
    if (keys.has('KeyE')) turn -= 1;
    if (turn) yaw += turn * TURN_SPEED * step;

    // ---- 目标速度 ------------------------------------------------------
    let fx = 0;
    let fz = 0;
    if (keys.has('KeyW') || keys.has('ArrowUp')) fz += 1;
    if (keys.has('KeyS') || keys.has('ArrowDown')) fz -= 1;
    if (keys.has('KeyA') || keys.has('ArrowLeft')) fx -= 1;
    if (keys.has('KeyD') || keys.has('ArrowRight')) fx += 1;

    // 触屏摇杆：与键盘同源叠加，模拟量即速度倍率（键盘满推时仍为 1，行为不变）
    if (pad.x) fx += pad.x;
    if (pad.z) fz += pad.z;
    const inputMag = Math.min(1, Math.hypot(fx, fz));


    const sinY = Math.sin(yaw);
    const cosY = Math.cos(yaw);
    const cosP = Math.cos(pitch);
    const sinP = Math.sin(pitch);

    let dx;
    let dz;
    let dyTarget = 0;
    let speed;

    if (flying) {
      // 飞行：W/S 沿视线方向（含俯仰），A/D 水平平移，Space / C 升降
      speed = SPEED_FLY * speedScale;
      dx = -sinY * cosP * fz + cosY * fx;
      dz = -cosY * cosP * fz - sinY * fx;
      const len = Math.hypot(dx, dz);
      if (len > 1e-6) {
        const m = Math.min(1, 1 / len); // 斜向不额外加速，俯冲时水平分量自然变小
        dx *= m;
        dz *= m;
      } else {
        dx = 0;
        dz = 0;
      }
      dx *= inputMag;
      dz *= inputMag;
      if (fz) dyTarget += sinP * fz * speed;
      if (keys.has('Space')) dyTarget += FLY_RISE * speedScale;
      if (keys.has('KeyC') || keys.has('ControlLeft') || keys.has('ControlRight')) {
        dyTarget -= FLY_RISE * speedScale;
      }
    } else {
      speed = SPEED_WALK * speedScale;
      dx = -sinY * fz + cosY * fx;
      dz = -cosY * fz - sinY * fx;
      const len = Math.hypot(dx, dz);
      if (len > 1e-6) {
        dx /= len;
        dz /= len;
      } else {
        dx = 0;
        dz = 0;
      }
      dx *= inputMag;
      dz *= inputMag;
    }

    const accel = flying || onGround ? ACCEL : ACCEL * AIR_CONTROL;
    const k = 1 - Math.exp(-accel * step);
    vx += (dx * speed - vx) * k;
    vz += (dz * speed - vz) * k;

    // ---- 垂直：跳跃 / 重力 / 飞行升降 ----------------------------------
    if (flying) {
      vy += (dyTarget - vy) * (1 - Math.exp(-8 * step));
      feetY += vy * step;
      if (feetY < GROUND_Y) {
        feetY = GROUND_Y;
        if (vy < 0) vy = 0;
      }
      if (feetY > MAX_ALT) {
        feetY = MAX_ALT;
        if (vy > 0) vy = 0;
      }
      onGround = feetY <= GROUND_Y + 1e-3;
    } else {
      if (jumpQueued && onGround) {
        vy = JUMP_SPEED;
        onGround = false;
      }
      vy -= GRAVITY * step;
      feetY += vy * step;
      if (feetY <= GROUND_Y) {
        feetY = GROUND_Y;
        vy = 0;
        onGround = true;
      }
    }
    jumpQueued = false;

    // ---- 分轴推进：撞墙时只吃掉那一个分量，可以贴着立面滑行 ----
    // 以脚底高度判定：飞天越过屋顶之后就不再被该体量挡住
    // 高倍档下单帧位移可能超过薄墙厚度，按 ≤0.25 单位切分子步，避免穿透
    const stepLen = Math.hypot(vx, vz) * step;
    const nSub = stepLen > SUB_STEP ? Math.ceil(stepLen / SUB_STEP) : 1;
    for (let i = 0; i < nSub; i++) {
      if (vx) {
        const nx = x + (vx * step) / nSub;
        if (!blocked(nx, z, feetY)) x = nx;
        else vx = 0;
      }
      if (vz) {
        const nz = z + (vz * step) / nSub;
        if (!blocked(x, nz, feetY)) z = nz;
        else vz = 0;
      }
    }

    // ---- 步伐起伏（仅贴地行走） ----------------------------------------
    const moving = Math.hypot(vx, vz) > 0.06;
    const stepping = moving && onGround && !flying;
    if (stepping) bobPhase += step * clamp(7.6 * speedScale, 7.6, 13);
    const bobY = stepping ? Math.sin(bobPhase) * 0.013 : 0;

    syncAvatar(step, moving);

    // ---- 相机：第一人称贴眼 / 第三人称跟随并避让建筑 --------------------
    if (view === 'third') {
      const pivotY = feetY + AVATAR_H * 0.86;
      const fwdX = -sinY * cosP;
      const fwdY = sinP;
      const fwdZ = -cosY * cosP;
      let dist = TP_DIST;
      for (let i = 1; i <= TP_STEPS; i++) {
        const d = (TP_DIST * i) / TP_STEPS;
        const cy = pivotY + TP_LIFT - fwdY * d;
        if (rectHit(x - fwdX * d, z - fwdZ * d, cy, CAM_RADIUS)) {
          dist = Math.max(TP_MIN_DIST, (TP_DIST * (i - 1)) / TP_STEPS);
          break;
        }
      }
      persp.position.set(x - fwdX * dist, pivotY + TP_LIFT - fwdY * dist, z - fwdZ * dist);
      persp.lookAt(x, pivotY + AVATAR_H * 0.12, z);
    } else {
      persp.position.set(x, feetY + EYE_OFFSET + bobY, z);
      persp.rotation.set(pitch, yaw, 0, 'YXZ');
    }

    // ---- 读数 ----------------------------------------------------------
    readoutFrame++;
    if (readoutFrame % 8 === 0 && posEl) {
      if (!where || readoutFrame % 48 === 0) {
        let bd = Infinity;
        let name = '';
        (store.landmarks || []).forEach((lm) => {
          const d = Math.hypot(lm.x - x, lm.z - z);
          if (d < bd) {
            bd = d;
            name = lm.name;
          }
        });
        where = bd < 220 ? name : '';
      }
      posEl.textContent = `${where ? where + ' · ' : ''}X ${Math.round(x * UNIT)}m / Z ${Math.round(z * UNIT)}m`;
    }
  }

  engine.onUpdate(update);

  /* --------------------------- 进入 / 退出 --------------------------- */

  function enter(spot) {
    if (active) return;
    if (!built) buildColliders();
    if (rig && rig.stop) rig.stop(); // 正在 FlyTo 的运镜必须让位

    // 与正俯视互斥：先回到透视视角（rig 会还原进入顶视图前保存的机位）
    if (engine.state.topview && rig) {
      rig.setTopView(false);
      store.state.topview = false;
      document.body.classList.remove('topview');
      const btn = document.getElementById('topview-btn');
      if (btn) btn.classList.remove('on');
    }

    const [sx, sz] = resolveSpawn(spot);
    x = sx;
    z = sz;
    vx = 0;
    vz = 0;
    bobPhase = 0;
    pitch = 0;
    where = '';

    // 朝向：沿用上帝视角此刻的注视方向（水平分量），「落地后继续朝那个方向看」
    const dirX = controls.target.x - persp.position.x;
    const dirZ = controls.target.z - persp.position.z;
    if (Math.hypot(dirX, dirZ) > 1e-3) yaw = Math.atan2(-dirX, -dirZ);
    else yaw = 0;

    saved = {
      pos: persp.position.clone(),
      target: controls.target.clone(),
      fov: persp.fov,
      near: persp.near,
      far: persp.far,
      fogNear: scene.fog ? scene.fog.near : null,
      fogFar: scene.fog ? scene.fog.far : null,
      controlsEnabled: controls.enabled,
    };

    active = true;
    engine.state.walk = true;
    if (store.state) store.state.walk = true;
    controls.enabled = false;

    persp.fov = FOV;
    persp.near = NEAR;
    persp.updateProjectionMatrix();
    if (scene.fog) {
      scene.fog.near = FOG_NEAR;
      scene.fog.far = FOG_FAR;
    }

    keys.clear();
    feetY = GROUND_Y;
    vy = 0;
    onGround = true;
    jumpQueued = false;
    flying = false;
    view = 'first';
    gear = 1;
    speedScale = GEAR_MULT[0];
    wheelAcc = 0;
    avatarYaw = yaw;
    if (hudEl) hudEl.hidden = false;
    document.body.classList.add('walking');
    const walkBtn = document.getElementById('walk-btn');
    if (walkBtn) walkBtn.classList.add('on');
    ensureAvatar();
    syncAvatar(0, false);
    syncHud();

    persp.position.set(x, feetY + EYE_OFFSET, z);
    persp.rotation.set(pitch, yaw, 0, 'YXZ');

    requestLock();

    if (L.teleportPanel && L.teleportPanel.close) L.teleportPanel.close();
    hint('进入漫游 · WASD 行走，V 切换视角，T 传送，ESC 退出');
  }

  function exit() {
    if (!active) return;
    active = false;
    keys.clear();
    dragging = false;
    lockPaused = false;
    resetTouchInput();
    engine.state.walk = false;
    if (store.state) store.state.walk = false;

    releaseLock();
    if (hudEl) hudEl.hidden = true;
    document.body.classList.remove('walking');
    const walkBtn = document.getElementById('walk-btn');
    if (walkBtn) walkBtn.classList.remove('on');

    // 复位第三人称 / 飞行状态
    if (avatar) avatar.visible = false;
    if (blob) blob.visible = false;
    flying = false;
    view = 'first';
    gear = 1;
    speedScale = GEAR_MULT[0];
    wheelAcc = 0;
    document.body.classList.remove('walk-third', 'walk-fly');

    if (saved) {
      persp.position.copy(saved.pos);
      persp.fov = saved.fov;
      persp.near = saved.near;
      persp.far = saved.far;
      persp.updateProjectionMatrix();
      persp.rotation.set(0, 0, 0, 'XYZ');
      controls.target.copy(saved.target);
      controls.enabled = saved.controlsEnabled;
      if (scene.fog) {
        if (saved.fogNear != null) scene.fog.near = saved.fogNear;
        if (saved.fogFar != null) scene.fog.far = saved.fogFar;
      }
      saved = null;
    }

    hint('已退出漫游');
  }

  function toggle(spot) {
    if (active) exit();
    else enter(spot);
  }

  return {
    enter,
    exit,
    toggle,
    get active() {
      return active;
    },
    /** 供外部（例如「定位到某地块」）更新落点 / 供验收脚本读取运动状态 */
    get position() {
      return { x, z, y: feetY, yaw, pitch, view, flying, onGround, gear, speedScale };
    },
    /** 行驶 / 飞行加速档：1..3，每档翻倍（1× / 2× / 4×） */
    setGear,
    cycleGear,
    /** 传送：按组团 / 地名直接落到该区域（返回实际落点） */
    teleport,
    /** 覆盖面板打开 / 关闭时临时接管鼠标锁定 */
    pauseLook,
    resumeLook,
    /** 调试 / 验收：某点在某高度是否被建筑挡住（飞天越过屋顶的判据） */
    blockedAt(px, pz, atY = GROUND_Y) {
      return blocked(px, pz, atY);
    },
    /** 验收辅助：强制重建碰撞索引（体量在运行期被替换后用得上） */
    rebuild() {
      built = false;
      buildColliders();
      return colliders.length;
    },
    dispose() {
      exit();
      if (origControlsUpdate) controls.update = origControlsUpdate;
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      dom.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointermove', onPointerMove);
      dom.removeEventListener('wheel', onWheel);
      document.removeEventListener('pointerlockchange', onLockChange);
      dom.removeEventListener('touchstart', onTouchStart);
      dom.removeEventListener('touchmove', onTouchMove);
      dom.removeEventListener('touchend', onTouchEnd);
      dom.removeEventListener('touchcancel', onTouchEnd);
      if (viewBtn) viewBtn.removeEventListener('click', onViewClick);
      if (flyBtn) flyBtn.removeEventListener('click', onFlyClick);
      if (gearBtn) gearBtn.removeEventListener('click', onGearClick);
    },
  };
}

/* ======================================================================
 * 传送面板（移植自 sandbox/src/ui/teleport.js）
 * ==================================================================== */

const $ = (id) => document.getElementById(id);

/** 焦点在输入控件里时，快捷键要让位给打字 */
function isField(el) {
  if (!el) return false;
  const tag = String(el.tagName || '').toUpperCase();
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable === true;
}

/**
 * 目的地清单：站点 store 未实现 teleportTargets()，此处按同一规则就地复刻 ——
 * 地名所在地块编号 → 若无则取最近编号 → 再无则 T{序号}；同码追加 #2/#3。
 */
function buildTeleportTargets(store) {
  if (!store) return [];
  if (typeof store.teleportTargets === 'function') return store.teleportTargets();

  const plots = Array.isArray(store.plots) ? store.plots : [];
  const codeIndex = Array.isArray(store.codeIndex) ? store.codeIndex : [];
  const landmarks = Array.isArray(store.landmarks) ? store.landmarks : [];

  const plotAt = (px, pz) =>
    plots.find((p) => p && p.polygon && pointInPolygon(px, pz, p.polygon)) || null;

  let ncCode = '';
  let ncDist = Infinity;
  const nearestCode = (px, pz) => {
    ncCode = '';
    ncDist = Infinity;
    for (let i = 0; i < codeIndex.length; i++) {
      const e = codeIndex[i];
      if (!e || !e.code || !e.center) continue;
      const d = Math.hypot(e.center[0] - px, e.center[1] - pz);
      if (d < ncDist) {
        ncDist = d;
        ncCode = e.code;
      }
    }
    return ncCode;
  };

  const used = new Map();
  return landmarks
    .filter((lm) => lm && lm.name && Number.isFinite(lm.x) && Number.isFinite(lm.z))
    .map((lm, i) => {
      const plot = plotAt(lm.x, lm.z);
      let code =
        (plot && (plot.code || (plot.codes || [])[0])) ||
        nearestCode(lm.x, lm.z) ||
        `T${i + 1}`;
      code = String(code).toUpperCase();
      const n = (used.get(code) || 0) + 1;
      used.set(code, n);
      if (n > 1) code = `${code}#${n}`;
      return { code, name: lm.name, x: lm.x, z: lm.z };
    });
}

/**
 * 快速传送面板（漫游中）：按组团 / 地名 / 编号直接落到对应区域。
 * · T 键 / HUD「传送」按钮开关，ESC 关闭；
 * · 关键字过滤（如「溪」「岛」「C23」），↑↓ 选择，Enter 传送；
 * · 打开面板会临时释放鼠标锁定，关闭后自动尝试重新锁定。
 */
function createTeleport(store, walk, opts = {}) {
  const { toast = null } = opts;
  const panel = $('walk-tp');
  const openBtn = $('walk-tp-open');
  const closeBtn = $('walk-tp-close');
  const input = $('walk-tp-search');
  const list = $('walk-tp-list');
  const countEl = $('walk-tp-count');

  const targets = opts.targets || buildTeleportTargets(store);

  const api = {
    isOpen: false,
    open() {
      setOpen(true);
    },
    close() {
      setOpen(false);
    },
    toggle() {
      setOpen(!api.isOpen);
    },
    targets,
  };

  if (!panel || !list || !input) return api;

  let items = [];
  let cursor = 0;

  // ---- 列表 ---------------------------------------------------------------
  function highlight() {
    [...list.children].forEach((row, i) => {
      const on = i === cursor;
      row.classList.toggle('active', on);
      if (on && row.scrollIntoView) row.scrollIntoView({ block: 'nearest' });
    });
  }

  /** 名称或编号命中（编号忽略大小写） */
  function match(t, q) {
    if (t.name.includes(q)) return true;
    const code = String(t.code || '');
    return !!code && code.toUpperCase().includes(q.toUpperCase());
  }

  function render() {
    const q = input.value.trim();
    items = q ? targets.filter((t) => match(t, q)) : targets.slice();
    cursor = items.length ? 0 : -1;
    list.innerHTML = '';

    if (!items.length) {
      const empty = document.createElement('div');
      empty.className = 'tp-empty';
      empty.textContent = targets.length ? '没有匹配的组团 / 地名 / 编号' : '暂无可用地名';
      list.appendChild(empty);
    } else {
      const frag = document.createDocumentFragment();
      items.forEach((t, i) => {
        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'tp-item';
        row.dataset.i = String(i);
        row.innerHTML = `<span class="tp-code">${t.code || '—'}</span><span class="tp-name">${t.name}</span><span class="tp-dot"></span>`;
        row.addEventListener('click', () => go(i));
        row.addEventListener('mousemove', () => {
          if (cursor === i) return;
          cursor = i;
          highlight();
        });
        frag.appendChild(row);
      });
      list.appendChild(frag);
    }

    if (countEl) countEl.textContent = `${items.length}/${targets.length}`;
    highlight();
  }

  function move(delta) {
    if (!items.length) return;
    cursor = (cursor + delta + items.length) % items.length;
    highlight();
  }

  /** 传送到第 i 个目的地 */
  function go(i) {
    const t = items[i];
    if (!t) return;
    const at = walk.teleport(t);
    if (!at && toast) toast('传送失败：目标点不可达');
    setOpen(false);
    if (walk.resumeLook) walk.resumeLook();
  }

  // ---- 开关 ---------------------------------------------------------------
  function setOpen(next) {
    if (next === api.isOpen) return;
    api.isOpen = next;
    panel.hidden = !next;
    if (openBtn) openBtn.classList.toggle('on', next);

    if (next) {
      if (!walk.active) {
        api.isOpen = false;
        panel.hidden = true;
        if (openBtn) openBtn.classList.remove('on');
        return;
      }
      if (walk.pauseLook) walk.pauseLook();
      input.value = '';
      render();
      input.focus();
    } else {
      input.blur();
      if (walk.resumeLook) walk.resumeLook();
    }
  }

  // ---- 交互 ---------------------------------------------------------------
  if (openBtn) openBtn.addEventListener('click', () => setOpen(!api.isOpen));
  if (closeBtn) closeBtn.addEventListener('click', () => setOpen(false));

  input.addEventListener('input', render);

  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      move(1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      move(-1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (cursor >= 0) go(cursor);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
      e.stopPropagation();
    }
  });

  // 捕获阶段优先处理：面板打开时吃掉 ESC，避免顺带退出漫游
  function onHotkey(e) {
    if (e.code === 'Escape' && api.isOpen) {
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
      return;
    }
    if (e.code !== 'KeyT' || e.repeat || isField(e.target)) return;
    if (!walk.active) return;
    e.preventDefault();
    e.stopPropagation();
    setOpen(!api.isOpen);
  }
  window.addEventListener('keydown', onHotkey, true);

  api.render = render;
  api.setOpen = setOpen;
  api.dispose = () => window.removeEventListener('keydown', onHotkey, true);
  return api;
}

/* ======================================================================
 * 启动：等宿主就绪 → 建漫游 → 建传送面板 → 接按钮
 * ==================================================================== */

async function bootWalk() {
  let L;
  try {
    L = await waitFor(() => {
      const w = window.__luxelakes;
      return w && w.engine && w.engine.onUpdate && w.store ? w : null;
    }, 120000, 150);
  } catch (err) {
    console.warn('[walk] 未等到宿主就绪，漫游未启用：', err && err.message ? err.message : err);
    return;
  }

  if (L.walk) return; // 幂等：避免重复注入

  // 两个子站的构建器导出名不同：现代站给 voxels（含 buildingFootprints），
  // 体素站的体量在 world.groups 里。这里统一成 walk 侧认识的形状。
  if (!L.voxels && L.world && L.world.groups) {
    L.voxels = { groups: L.world.groups, buildingFootprints: [] };
  }

  const hud = L.hud || {};
  const toast = (msg, ms) => {
    if (typeof hud.toast === 'function') hud.toast(msg, ms);
  };

  const walk = createWalkMode(L);
  const teleport = createTeleport(L.store, walk, { toast });
  walk.teleportPanel = teleport;

  L.walk = walk;
  L.teleport = teleport;
  window.__walk = walk;

  const btn = document.getElementById('walk-btn');
  if (btn) {
    btn.disabled = false;
    btn.addEventListener('click', () => walk.toggle());
  }
  const exitBtn = document.getElementById('walk-exit');
  if (exitBtn) exitBtn.addEventListener('click', () => walk.exit());

  console.log(
    `[walk] 漫游已就绪：${walk.rebuild()} 个碰撞体 · ${teleport.targets.length} 个传送目的地`
  );
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootWalk);
} else {
  bootWalk();
}

