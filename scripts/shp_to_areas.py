"""서울 도시계획사업(서울플랜+) SHP(EPSG:5174)에서 당사 사업장 경계를 골라 WGS84 좌표로 바꿉니다.
사용법: python3 shp_to_areas.py [--5186] <shp 파일> <dbf 파일> <구역번호(행번호)…>
  --5186: 국토부 연속주제 정비구역(LSMD_CONT_UD602) 등 EPSG:5186 자료
외부 라이브러리 없이 동작합니다."""
import math, struct, sys, json

def read_dbf(path):
    f = open(path, 'rb').read()
    n, hl, rl = struct.unpack('<IHH', f[4:12])
    fields, o = [], 32
    while f[o] != 0x0D:
        fields.append((f[o:o+11].split(b'\0')[0].decode(), f[o+16])); o += 32
    out = []
    for i in range(n):
        r = f[hl+i*rl: hl+(i+1)*rl]; p = 1; d = {}
        for name, ln in fields:
            d[name] = r[p:p+ln].decode('cp949', 'replace').strip(); p += ln
        out.append(d)
    return out

def read_shp(path):
    f = open(path, 'rb').read(); o = 100; shapes = []
    while o < len(f):
        _, clen = struct.unpack('>II', f[o:o+8]); o += 8
        body = f[o:o+clen*2]; o += clen*2
        st = struct.unpack('<i', body[:4])[0]
        if st in (5, 15, 25):
            npart, npt = struct.unpack('<ii', body[36:44])
            parts = list(struct.unpack('<%di' % npart, body[44:44+4*npart]))
            base = 44 + 4*npart
            pts = [struct.unpack('<dd', body[base+16*k: base+16*k+16]) for k in range(npt)]
            rings = [pts[parts[j]:(parts[j+1] if j+1 < npart else npt)] for j in range(npart)]
            shapes.append(rings)
        else:
            shapes.append([])
    return shapes

# EPSG:5174 (Bessel 1841, 수정 중부원점) → WGS84
A, INVF = 6377397.155, 299.1528128
B_ = A * (1 - 1/INVF); E2 = 1 - (B_/A)**2
LAT0, LON0, K0, FE, FN = math.radians(38.0), math.radians(127.0028902777778), 1.0, 200000.0, 500000.0
TOWGS = (-115.80, 474.99, 674.11, 1.16, -2.31, -1.63, 6.43)

def mlen(phi, a=None, e2=None):
    a = A if a is None else a; e2 = E2 if e2 is None else e2
    e4, e6 = e2*e2, e2**3
    return a*((1-e2/4-3*e4/64-5*e6/256)*phi - (3*e2/8+3*e4/32+45*e6/1024)*math.sin(2*phi)
              + (15*e4/256+45*e6/1024)*math.sin(4*phi) - (35*e6/3072)*math.sin(6*phi))

def tm_inverse(x, y):
    M = mlen(LAT0) + (y - FN)/K0
    e2 = E2; e1 = (1-math.sqrt(1-e2))/(1+math.sqrt(1-e2))
    mu = M/(A*(1-e2/4-3*e2**2/64-5*e2**3/256))
    p1 = mu + (3*e1/2-27*e1**3/32)*math.sin(2*mu) + (21*e1**2/16-55*e1**4/32)*math.sin(4*mu) + (151*e1**3/96)*math.sin(6*mu) + (1097*e1**4/512)*math.sin(8*mu)
    ep2 = e2/(1-e2)
    C1 = ep2*math.cos(p1)**2; T1 = math.tan(p1)**2
    N1 = A/math.sqrt(1-e2*math.sin(p1)**2); R1 = A*(1-e2)/(1-e2*math.sin(p1)**2)**1.5
    D = (x-FE)/(N1*K0)
    lat = p1 - (N1*math.tan(p1)/R1)*(D**2/2 - (5+3*T1+10*C1-4*C1**2-9*ep2)*D**4/24 + (61+90*T1+298*C1+45*T1**2-252*ep2-3*C1**2)*D**6/720)
    lon = LON0 + (D - (1+2*T1+C1)*D**3/6 + (5-2*C1+28*T1-3*C1**2+8*ep2+24*T1**2)*D**5/120)/math.cos(p1)
    return lat, lon

def geo2ecef(lat, lon, a, e2, h=0):
    N = a/math.sqrt(1-e2*math.sin(lat)**2)
    return ((N+h)*math.cos(lat)*math.cos(lon), (N+h)*math.cos(lat)*math.sin(lon), (N*(1-e2)+h)*math.sin(lat))

def ecef2geo(X, Y, Z, a, e2):
    lon = math.atan2(Y, X); p = math.hypot(X, Y); lat = math.atan2(Z, p*(1-e2))
    for _ in range(8):
        N = a/math.sqrt(1-e2*math.sin(lat)**2); lat = math.atan2(Z + e2*N*math.sin(lat), p)
    return lat, lon

WA, WE2 = 6378137.0, 0.00669437999014
CRS = '5174'
def use_5186():  # 국토부·브이월드 SHP (GRS80 중부원점, FN 600000) — WGS84와 사실상 같은 기준
    global A, E2, LON0, FN, CRS
    A, E2, LON0, FN, CRS = 6378137.0, 0.00669438002290, math.radians(127.0), 600000.0, '5186'
def to_wgs(x, y):
    lat, lon = tm_inverse(x, y)
    if CRS == '5186': return round(math.degrees(lat), 6), round(math.degrees(lon), 6)
    X, Y, Z = geo2ecef(lat, lon, A, E2)
    tx, ty, tz, rx, ry, rz, s = TOWGS
    rx, ry, rz = (math.radians(v/3600) for v in (rx, ry, rz)); m = 1 + s*1e-6
    X2 = tx + m*(X - rz*Y + ry*Z); Y2 = ty + m*(rz*X + Y - rx*Z); Z2 = tz + m*(-ry*X + rx*Y + Z)
    la, lo = ecef2geo(X2, Y2, Z2, WA, WE2)
    return round(math.degrees(la), 6), round(math.degrees(lo), 6)

def simplify(pts, tol=1.0):  # Douglas-Peucker (미터 단위, 원 좌표계)
    if len(pts) < 4: return pts
    def rec(a, b):
        (x1, y1), (x2, y2) = pts[a], pts[b]; dx, dy = x2-x1, y2-y1; L = math.hypot(dx, dy) or 1e-9
        dmax, idx = 0, None
        for i in range(a+1, b):
            d = abs(dy*pts[i][0] - dx*pts[i][1] + x2*y1 - y2*x1)/L
            if d > dmax: dmax, idx = d, i
        return rec(a, idx)[:-1] + rec(idx, b) if dmax > tol else [pts[a], pts[b]]
    return rec(0, len(pts)-1)

if __name__ == '__main__':
    args = sys.argv[1:]
    if args[0] == '--5186': use_5186(); args = args[1:]
    shp, dbf, *ids = args
    recs, shapes = read_dbf(dbf), read_shp(shp)
    out = {}
    for i in map(int, ids):
        rings = sorted(shapes[i], key=len, reverse=True)
        ring = rings[0][:-1] if rings[0][0] == rings[0][-1] else rings[0]
        far = max(range(len(ring)), key=lambda k: (ring[k][0]-ring[0][0])**2 + (ring[k][1]-ring[0][1])**2)
        ring = simplify(ring[:far+1], 0.8)[:-1] + simplify(ring[far:] + [ring[0]], 0.8)[:-1]
        out[i] = {'name': (recs[i].get('DGM_NM') or recs[i].get('ALIAS') or recs[i].get('REMARK') or '').strip('\x00 '), 'ar': float(recs[i].get('DGM_AR') or 0), 'parts': len(rings), 'path': [list(to_wgs(x, y)) for x, y in ring]}
    print(json.dumps(out, ensure_ascii=False))
