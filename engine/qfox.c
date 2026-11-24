/*
 * Q-FOX engine — implementation. See qfox.h for the design rationale.
 */
#include "qfox.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

#define QF_BAD_IDX UINT64_MAX
#define QF_UNKNOWN 255u

/* ================================================================== *
 * geometry
 * ================================================================== */
typedef struct { int8_t x, y, z, nx, ny, nz; } FaceletGeo;

static FaceletGeo g_fl[QF_FACELETS];
static int g_inited = 0;

typedef struct {
  int8_t fl[3];
  int8_t n;        /* 2 edge, 3 corner */
  int8_t type;     /* 0 corner, 1 edge */
  int8_t x, y, z;
  int8_t ref;      /* index into fl[] of the orientation reference facelet */
  char   name[4];
} Slot;

static Slot g_slot[QF_SLOTS];


/* piece identification tables, derived from the solved cube */
static int8_t g_edge_of_pair[6][6];
static int8_t g_corner_of_triple[6][6][6];
static int8_t g_edge_ref_colour[QF_EDGES];   /* colour on ref facelet, piece == slot */
static int8_t g_corner_ref_colour[QF_CORNERS];

/* move data */
static int8_t  g_perm[QF_NMOVES][QF_FACELETS];
static int8_t  g_dest[QF_NMOVES][QF_SLOTS];
static int8_t  g_src[QF_NMOVES][QF_SLOTS];
static int8_t  g_delt[QF_NMOVES][QF_SLOTS];      /* leaving slot s */
static int8_t  g_deltFrom[QF_NMOVES][QF_SLOTS];  /* arriving at slot s */
static int8_t  g_axis[QF_NMOVES];
static int8_t  g_pow[QF_NMOVES];
static int8_t  g_isrot[QF_NMOVES];
static uint8_t g_cost[QF_NMETRICS][QF_NMOVES];
static char    g_name[QF_NMOVES][4];

static void build_binom(void);

static void rot_apply(int kind, int *x, int *y, int *z) {
  int X = *x, Y = *y, Z = *z;
  switch (kind) {
    /* Rotations about the two vertical axes are the easy ones to get backwards:
     * x' = z, z' = -x is the right-hand rule about +y, which is COUNTER-
     * clockwise seen from above, i.e. the opposite of what "U" means.  Clockwise
     * seen from above carries the front row to the left, so U is x' = -z, z' = x
     * and D -- clockwise seen from below, which is the other way round from
     * above -- is its mirror.  Getting this wrong is invisible to every other
     * check in this file, because a cube whose U turns the wrong way is still
     * perfectly self-consistent; it only shows up as mirrored notation in every
     * algorithm the project ever prints.  Layer 0b of the self-test pins it. */
    case 0: *x = -Z; *y = Y; *z =  X; break; /* U / y / u : clockwise from above */
    case 1: *x =  Z; *y = Y; *z = -X; break; /* D / E / d : clockwise from below */
    case 2: *x = X;  *y =  Z; *z = -Y; break; /* R / x : clockwise from right */
    case 3: *x = X;  *y = -Z; *z =  Y; break; /* L / M : clockwise from left  */
    case 4: *x =  Y; *y = -X; *z =  Z; break; /* F / S / z                    */
    case 5: *x = -Y; *y =  X; *z =  Z; break; /* B                            */
  }
}

static int kind_axis(int kind) {
  switch (kind) { case 0: case 1: return 0; case 2: case 3: return 1; default: return 2; }
}

typedef struct { const char *name; int kind, layer, isrot, axis_sel; } MoveDef;

static int in_layer(int axis_sel, int layer, int x, int y, int z) {
  int v = axis_sel == 0 ? x : (axis_sel == 1 ? y : z);
  switch (layer) {
    case 0: return v ==  1;
    case 1: return v == -1;
    case 2: return v ==  0;
    case 3: return v >=  0;
    case 4: return v <=  0;
    case 5: return 1;
  }
  return 0;
}

static const MoveDef g_mdef[] = {
  {"U", 0, 0, 0, 1}, {"R", 2, 0, 0, 0}, {"F", 4, 0, 0, 2},
  {"D", 1, 1, 0, 1}, {"L", 3, 1, 0, 0}, {"B", 5, 1, 0, 2},
  {"M", 3, 2, 0, 0}, {"E", 1, 2, 0, 1}, {"S", 4, 2, 0, 2},
  {"r", 2, 3, 0, 0}, {"l", 3, 4, 0, 0},
  {"u", 0, 3, 0, 1}, {"d", 1, 4, 0, 1},
  {"f", 4, 3, 0, 2}, {"b", 5, 4, 0, 2},
  {"x", 2, 5, 1, 0}, {"y", 0, 5, 1, 1}, {"z", 4, 5, 1, 2}
};
#define N_MDEF ((int)(sizeof(g_mdef) / sizeof(g_mdef[0])))

static int fl_idx(int face, int row, int col) { return face * 9 + row * 3 + col; }

static void build_geometry(void) {
  int f, r, c, i;
  for (f = 0; f < 6; f++)
    for (r = 0; r < 3; r++)
      for (c = 0; c < 3; c++) {
        i = fl_idx(f, r, c);
        FaceletGeo *g = &g_fl[i];
        switch (f) {
          case 0: g->x = c - 1; g->y = 1;     g->z = r - 1; g->nx = 0;  g->ny = 1;  g->nz = 0;  break;
          case 1: g->x = 1;     g->y = 1 - r; g->z = 1 - c; g->nx = 1;  g->ny = 0;  g->nz = 0;  break;
          case 2: g->x = c - 1; g->y = 1 - r; g->z = 1;     g->nx = 0;  g->ny = 0;  g->nz = 1;  break;
          case 3: g->x = c - 1; g->y = -1;    g->z = 1 - r; g->nx = 0;  g->ny = -1; g->nz = 0;  break;
          case 4: g->x = -1;    g->y = 1 - r; g->z = c - 1; g->nx = -1; g->ny = 0;  g->nz = 0;  break;
          case 5: g->x = 1 - c; g->y = 1 - r; g->z = -1;    g->nx = 0;  g->ny = 0;  g->nz = -1; break;
        }
      }
}

static int find_facelet(int x, int y, int z, int nx, int ny, int nz) {
  int i;
  for (i = 0; i < QF_FACELETS; i++)
    if (g_fl[i].x == x && g_fl[i].y == y && g_fl[i].z == z &&
        g_fl[i].nx == nx && g_fl[i].ny == ny && g_fl[i].nz == nz) return i;
  return -1;
}

static void name_slot(int x, int y, int z, int type, char *out) {
  char a = 0, b = 0, c = 0;
  if (y > 0) a = 'U'; else if (y < 0) a = 'D';
  if (z > 0) b = 'F'; else if (z < 0) b = 'B';
  if (x > 0) c = 'R'; else if (x < 0) c = 'L';
  if (type == 0) { out[0] = a; out[1] = c; out[2] = b; out[3] = 0; }
  else {
    if (a) { out[0] = a; out[1] = b ? b : c; }
    else   { out[0] = b; out[1] = c; }
    out[2] = 0;
  }
}

static void build_slots(void) {
  int xs[3] = {-1, 0, 1}, ys[3] = {1, 0, -1}, zs[3] = {1, 0, -1};
  int ay, ax, az, i, ncorner = 0, nedge = 0;
  for (ay = 0; ay < 3; ay++)
    for (ax = 0; ax < 3; ax++)
      for (az = 0; az < 3; az++) {
        int x = xs[ax], y = ys[ay], z = zs[az];
        int fls[4], n = 0;
        if (x == 0 && y == 0 && z == 0) continue;
        for (i = 0; i < QF_FACELETS; i++)
          if (g_fl[i].x == x && g_fl[i].y == y && g_fl[i].z == z) fls[n++] = i;
        if (n == 3) {
          Slot *s = &g_slot[ncorner];
          int a = -1, k;
          for (k = 0; k < 3; k++) if (g_fl[fls[k]].ny != 0) a = k;
          if (a < 0) { fprintf(stderr, "qfox: corner without U/D normal\n"); exit(1); }
          int8_t va[3], vb[3], vc[3], cr[3];
          va[0] = g_fl[fls[a]].nx; va[1] = g_fl[fls[a]].ny; va[2] = g_fl[fls[a]].nz;
          int b = -1, c = -1;
          for (k = 0; k < 3; k++) if (k != a) { if (b < 0) b = k; else c = k; }
          vb[0] = g_fl[fls[b]].nx; vb[1] = g_fl[fls[b]].ny; vb[2] = g_fl[fls[b]].nz;
          vc[0] = g_fl[fls[c]].nx; vc[1] = g_fl[fls[c]].ny; vc[2] = g_fl[fls[c]].nz;
          cr[0] = va[1]*vb[2] - va[2]*vb[1];
          cr[1] = va[2]*vb[0] - va[0]*vb[2];
          cr[2] = va[0]*vb[1] - va[1]*vb[0];
          int order[3];
          if (cr[0]==vc[0] && cr[1]==vc[1] && cr[2]==vc[2]) { order[0]=a; order[1]=b; order[2]=c; }
          else { order[0]=a; order[1]=c; order[2]=b; }
          s->fl[0]=fls[order[0]]; s->fl[1]=fls[order[1]]; s->fl[2]=fls[order[2]];
          s->n=3; s->type=0; s->x=x; s->y=y; s->z=z; s->ref=0;
          name_slot(x, y, z, 0, s->name);
          ncorner++;
        } else if (n == 2) {
          Slot *s = &g_slot[8 + nedge];
          int a = -1, k;
          for (k = 0; k < 2; k++) if (g_fl[fls[k]].ny != 0) a = k;
          if (a < 0) for (k = 0; k < 2; k++) if (g_fl[fls[k]].nz != 0) a = k;
          if (a < 0) { fprintf(stderr, "qfox: edge without reference normal\n"); exit(1); }
          int b = (a == 0) ? 1 : 0;
          s->fl[0]=fls[a]; s->fl[1]=fls[b]; s->fl[2]=-1;
          s->n=2; s->type=1; s->x=x; s->y=y; s->z=z; s->ref=0;
          name_slot(x, y, z, 1, s->name);
          nedge++;
        } else if (n == 1) {
          continue;   /* centre facelet: fixed reference, not a tracked cubie */
        } else {
          fprintf(stderr, "qfox: bad cubie (%d stickers)\n", n); exit(1);
        }
      }
  if (ncorner != 8 || nedge != 12) { fprintf(stderr, "qfox: slot build failed\n"); exit(1); }
}

static void build_moves(void) {
  int f, p, i;
  for (f = 0; f < N_MDEF; f++) {
    const MoveDef *md = &g_mdef[f];
    for (p = 0; p < 3; p++) {
      int mid = f * 3 + p, reps = p + 1;
      for (i = 0; i < QF_FACELETS; i++) g_perm[mid][i] = (int8_t)i;
      for (i = 0; i < QF_FACELETS; i++) {
        if (!in_layer(md->axis_sel, md->layer, g_fl[i].x, g_fl[i].y, g_fl[i].z)) continue;
        int x = g_fl[i].x, y = g_fl[i].y, z = g_fl[i].z;
        int nx = g_fl[i].nx, ny = g_fl[i].ny, nz = g_fl[i].nz, r;
        for (r = 0; r < reps; r++) { rot_apply(md->kind, &x, &y, &z); rot_apply(md->kind, &nx, &ny, &nz); }
        int j = find_facelet(x, y, z, nx, ny, nz);
        if (j < 0) { fprintf(stderr, "qfox: move geometry failed\n"); exit(1); }
        /* g_perm is the SOURCE map consumed by qf_apply (new[j] = old[i]),
         * so a sticker at i lands at j means we record j <- i. */
        g_perm[mid][j] = (int8_t)i;
      }
      g_axis[mid] = (int8_t)kind_axis(md->kind);
      g_pow[mid] = (int8_t)(p + 1);
      g_isrot[mid] = (int8_t)md->isrot;
      snprintf(g_name[mid], 4, "%s%s", md->name, p == 0 ? "" : (p == 1 ? "2" : "'"));
    }
  }
}

static void build_piece_tables(void) {
  QfCube sv; int s, i;
  qf_solved(&sv);
  memset(g_edge_of_pair, -1, sizeof(g_edge_of_pair));
  memset(g_corner_of_triple, -1, sizeof(g_corner_of_triple));
  for (s = 0; s < QF_SLOTS; s++) {
    const Slot *sl = &g_slot[s];
    if (sl->type == 1) {
      int a = sv.f[sl->fl[0]], b = sv.f[sl->fl[1]];
      g_edge_of_pair[a][b] = (int8_t)s;
      g_edge_of_pair[b][a] = (int8_t)s;
      g_edge_ref_colour[s - 8] = (int8_t)a;
    } else {
      int a = sv.f[sl->fl[0]], b = sv.f[sl->fl[1]], c = sv.f[sl->fl[2]];
      int v[3] = {a,b,c};
      int pm[6][3] = {{0,1,2},{0,2,1},{1,0,2},{1,2,0},{2,0,1},{2,1,0}};
      for (i = 0; i < 6; i++)
        g_corner_of_triple[v[pm[i][0]]][v[pm[i][1]]][v[pm[i][2]]] = (int8_t)s;
      g_corner_ref_colour[s] = (int8_t)a;
    }
  }
}

static void build_slot_transition(void) {
  QfCube base, moved;
  int m, s;
  qf_solved(&base);
  for (m = 0; m < QF_NMOVES; m++) {
    moved = base;
    qf_apply(&moved, m);
    for (s = 0; s < QF_SLOTS; s++) {
      const Slot *sl = &g_slot[s];
      int cols[3], k, t;
      for (k = 0; k < sl->n; k++) cols[k] = base.f[sl->fl[k]];
      for (t = 0; t < QF_SLOTS; t++) {
        if (g_slot[t].type != sl->type) continue;
        int mc[3], used[3] = {0,0,0}, ok = 1;
        for (k = 0; k < sl->n; k++) mc[k] = moved.f[g_slot[t].fl[k]];
        for (k = 0; k < sl->n; k++) {
          int q, found = 0;
          for (q = 0; q < sl->n; q++) if (!used[q] && mc[q] == cols[k]) { used[q] = 1; found = 1; break; }
          if (!found) { ok = 0; break; }
        }
        if (ok) break;
      }
      if (t >= QF_SLOTS) { fprintf(stderr, "qfox: slot transition failed\n"); exit(1); }
      g_dest[m][s] = (int8_t)t;
      g_src[m][t] = (int8_t)s;
      int d = 0;
      if (sl->type == 1) {
        int refr = g_slot[t].fl[g_slot[t].ref];
        d = (moved.f[refr] == g_edge_ref_colour[s - 8]) ? 0 : 1;
      } else {
        int ud = g_corner_ref_colour[s], q;
        for (q = 0; q < 3; q++) if (moved.f[g_slot[t].fl[q]] == ud) { d = q; break; }
      }
      g_delt[m][s] = (int8_t)d;
      g_deltFrom[m][t] = (int8_t)d;
    }
  }
}

static void build_costs(void) {
  int m;
  for (m = 0; m < QF_NMOVES; m++) {
    int outer = (m < 18), slice = (m >= 18 && m < 27);
    int quarter = (g_pow[m] != 2);
    g_cost[QF_HTM][m] = outer ? 1 : 2;
    g_cost[QF_QTM][m] = (quarter ? 1 : 2) * (outer ? 1 : 2);
    g_cost[QF_STM][m] = 1;
    g_cost[QF_ETM][m] = slice ? 2 : 1;
  }
}

/* ================================================================== *
 * cube basics
 * ================================================================== */
void qf_solved(QfCube *c) { int i; for (i = 0; i < QF_FACELETS; i++) c->f[i] = (uint8_t)(i / 9); }

void qf_apply(QfCube *c, int move) {
  uint8_t tmp[QF_FACELETS]; int i;
  const int8_t *p = g_perm[move];
  for (i = 0; i < QF_FACELETS; i++) tmp[i] = c->f[p[i]];
  memcpy(c->f, tmp, QF_FACELETS);
}

void qf_apply_seq(QfCube *c, const int *moves, int n) { int i; for (i = 0; i < n; i++) qf_apply(c, moves[i]); }

int qf_is_solved(const QfCube *c) {
  int i;
  for (i = 0; i < QF_FACELETS; i++) if (c->f[i] != i / 9) return 0;
  return 1;
}

int qf_parse_move(const char *tok) {
  char buf[8]; int i = 0, j = 0, f;
  while (tok[i] == ' ') i++;
  while (tok[i] && tok[i] != ' ' && j < 6) buf[j++] = tok[i++];
  buf[j] = 0;
  if (j == 0) return -1;
  int p = 0;
  if (j >= 2 && (buf[j-1] == '\'' || buf[j-1] == '2' || buf[j-1] == '3')) {
    p = buf[j-1] == '2' ? 1 : 2;
    buf[j-1] = 0; j--;
  }
  for (f = 0; f < N_MDEF; f++) if (strcmp(buf, g_mdef[f].name) == 0) return f * 3 + p;
  if (j == 2 && (buf[1] == 'w' || buf[1] == 'W')) {
    char alt[4] = { (char)(buf[0] - 'A' + 'a'), 0, 0, 0 };
    for (f = 0; f < N_MDEF; f++) if (strcmp(alt, g_mdef[f].name) == 0) return f * 3 + p;
  }
  return -1;
}

int qf_move_name(int move, char *out, size_t n) {
  if (move < 0 || move >= QF_NMOVES) return -1;
  snprintf(out, n, "%s", g_name[move]);
  return 0;
}

int qf_move_cost(int metric, int move) {
  if (metric < 0 || metric >= QF_NMETRICS || move < 0 || move >= QF_NMOVES) return -1;
  return g_cost[metric][move];
}

int qf_seq_cost(int metric, const int *moves, int n) {
  int i, s = 0;
  for (i = 0; i < n; i++) s += g_cost[metric][moves[i]];
  return s;
}

/* Geometric naming is systematic (U/D then R/L then F/B). The community uses a
 * clockwise naming that differs for three corners, so accept both. */
static const char *const g_slot_alias[][2] = {
  {"UFL", "ULF"}, {"UBR", "URB"}, {"DFR", "DRF"},
  {NULL, NULL}
};

int qf_slot_id(const char *name) {
  int s, i;
  for (s = 0; s < QF_SLOTS; s++) if (strcmp(g_slot[s].name, name) == 0) return s;
  for (i = 0; g_slot_alias[i][0]; i++)
    if (strcmp(g_slot_alias[i][0], name) == 0) return qf_slot_id(g_slot_alias[i][1]);
  return -1;
}

int qf_slot_name(int slot, char *out, size_t n) {
  if (slot < 0 || slot >= QF_SLOTS) return -1;
  snprintf(out, n, "%s", g_slot[slot].name);
  return 0;
}

int qf_init(void) {
  if (g_inited) return 0;
  build_binom();
  build_geometry();
  build_slots();
  build_moves();
  build_piece_tables();
  build_slot_transition();
  build_costs();
  g_inited = 1;
  return qf_check_consistency(200);
}

const char *qf_version(void) { return "qfox-engine 0.1.0"; }

/* ================================================================== *
 * sequence canonicalisation
 *
 * Two-phase output is not reduced ("R R2" instead of "R'"), and reduced
 * move counts are the whole point of this project, so every sequence we
 * report goes through this. It merges same-family turns until a fixed point,
 * which is exactly what a human would call "the same solve, written well".
 * ================================================================== */
/* Merging only ever shortens a sequence, so `n` ints of scratch is enough --
 * but a whole-solve sequence is far longer than one stage's QF_SOL_MAX answer
 * (a thirteen-stage beginner solve runs past 90 moves), so the scratch is
 * sized from `n` rather than from a constant.  Returns the new length,
 * -1 on a bad move id, -2 if the scratch could not be allocated. */
int qf_optimize(int *moves, int n) {
  int *out, *o2, on = 0, i, rc;
  if (n < 0) return -1;
  if (n == 0) return 0;
  out = (int *)malloc(sizeof(int) * ((size_t)n + 1));
  o2 = (int *)malloc(sizeof(int) * ((size_t)n + 1));
  if (!out || !o2) { free(out); free(o2); return -2; }

  for (i = 0; i < n; i++) {
    int m = moves[i];
    if (m < 0 || m >= QF_NMOVES) { rc = -1; goto done; }
    for (;;) {
      if (on == 0) { out[on++] = m; break; }
      int last = out[on - 1];
      if (last / 3 != m / 3) { out[on++] = m; break; }
      int p = (g_pow[last] % 4) + (g_pow[m] % 4);   /* 1,2,3 encoding */
      p %= 4;
      on--;
      if (p == 0) { m = -2; break; }                 /* cancelled out */
      m = (last / 3) * 3 + (p == 1 ? 0 : (p == 2 ? 1 : 2));
    }
    if (m == -2) continue;
  }
  /* a second pass picks up cancellations exposed by the first */
  int again = 1, guard = 0;
  while (again && guard++ < 4) {
    again = 0;
    int n2 = 0;
    for (i = 0; i < on; i++) {
      int m = out[i];
      if (n2 > 0 && o2[n2 - 1] / 3 == m / 3) {
        int p = ((g_pow[o2[n2-1]] % 4) + (g_pow[m] % 4)) % 4;
        n2--;
        again = 1;
        if (p == 0) continue;
        m = (out[i] / 3) * 3 + (p == 1 ? 0 : (p == 2 ? 1 : 2));
      }
      o2[n2++] = m;
    }
    memcpy(out, o2, sizeof(int) * (size_t)n2);
    on = n2;
  }
  for (i = 0; i < on; i++) moves[i] = out[i];
  rc = on;
done:
  free(out);
  free(o2);
  return rc;
}

/* ================================================================== *
 * piece map
 * ================================================================== */
static int slot_piece_orient(const QfCube *c, int s, int *orient) {
  const Slot *sl = &g_slot[s];
  if (sl->type == 1) {
    int a = c->f[sl->fl[0]], b = c->f[sl->fl[1]];
    int home = g_edge_of_pair[a][b];
    if (home < 0) return -1;
    *orient = (a == g_edge_ref_colour[home - 8]) ? 0 : 1;
    return home;
  } else {
    int a = c->f[sl->fl[0]], b = c->f[sl->fl[1]], d = c->f[sl->fl[2]];
    int home = g_corner_of_triple[a][b][d];
    if (home < 0) return -1;
    int ud = g_corner_ref_colour[home], q;
    *orient = 0;
    for (q = 0; q < 3; q++) if (c->f[sl->fl[q]] == ud) { *orient = q; break; }
    return home;
  }
}

int qf_cube_from_pmap(const QfPMap *m, QfCube *out) {
  int s, i;
  for (s = 0; s < QF_FACELETS; s++) out->f[s] = 255;   /* unclaimed sentinel */
  for (i = 0; i < 6; i++) out->f[i * 9 + 4] = (int8_t)i;   /* centres never move */
  for (s = 0; s < QF_SLOTS; s++) {
    const Slot *sl = &g_slot[s];
    int p = m->piece[s], o = m->orient[s];
    if (p < 0 || p >= QF_SLOTS) return -1;
    const Slot *hs = &g_slot[p];            /* a piece's home slot is its own id */
    if (sl->type != hs->type) return -2;    /* an edge cannot sit in a corner slot */
    if (sl->type == 1) {
      if (o < 0 || o > 1) return -3;
      int ref = g_edge_ref_colour[p - 8];
      int other = (hs->fl[1] / 9);
      if (ref != hs->fl[0] / 9) return -4;  /* geometry disagrees with itself */
      out->f[sl->fl[0]] = (int8_t)(o == 0 ? ref : other);
      out->f[sl->fl[1]] = (int8_t)(o == 0 ? other : ref);
    } else {
      if (o < 0 || o > 2) return -3;
      int ref = g_corner_ref_colour[p];
      if (ref != hs->fl[0] / 9) return -4;
      int k;
      for (k = 0; k < 3; k++)
        out->f[sl->fl[(o + k) % 3]] = (int8_t)(hs->fl[k] / 9);
    }
  }
  for (s = 0; s < QF_FACELETS; s++) if (out->f[s] == 255) return -5;
  return 0;
}

void qf_pmap(const QfCube *c, QfPMap *m) {
  int s;
  for (s = 0; s < QF_SLOTS; s++) {
    int o = 0;
    int p = slot_piece_orient(c, s, &o);
    m->piece[s] = (int8_t)p;
    m->orient[s] = (int8_t)o;
    if (p >= 0) m->slotof[p] = (int8_t)s;
  }
}

/* Apply one move to a piece map in place, straight from the precomputed
 * slot-transition tables (g_dest / g_delt). O(QF_SLOTS): the 54-facelet cube
 * is never touched, which is the whole point -- the IDA* search only ever
 * reads pmap (for the heuristic and the goal test), so carrying a full cube
 * through every node is pure waste. The cube is reconstructed from the move
 * list only at the very end, when a real facelet state is requested. */
void qf_pmap_apply(QfPMap *m, int move) {
  int8_t np[QF_SLOTS], no[QF_SLOTS], ns[QF_SLOTS];
  int s;
  for (s = 0; s < QF_SLOTS; s++) { np[s] = -1; no[s] = 0; ns[s] = -1; }
  for (s = 0; s < QF_SLOTS; s++) {
    int p = m->piece[s];
    if (p < 0) continue;
    int t = g_dest[move][s];
    int o = (int)m->orient[s] + (int)g_delt[move][s];
    if (g_slot[s].type == 1) o &= 1;
    else { o %= 3; if (o < 0) o += 3; }
    np[t] = (int8_t)p;
    no[t] = (int8_t)o;
    ns[p] = (int8_t)t;
  }
  for (s = 0; s < QF_SLOTS; s++) {
    m->piece[s] = np[s];
    m->orient[s] = no[s];
    m->slotof[s] = ns[s];
  }
}

/* ================================================================== *
 * coordinates
 *
 * A Coord is a product of parts. Each part is closed under every move set,
 * so the product is too, so BFS over the product gives exact distances.
 *
 *   piece-centric placement parts (EDGE/CORNER_PERM[_ORIENT])
 *       state  = for each tracked piece: which slot it occupies (a rank,
 *                optionally restricted to an "allowed" slot set, optionally
 *                only as a set rather than an ordered placement) and, for
 *                the _ORIENT variants, its orientation there.
 *       move   = slot <- dest[m][slot]; orientation <- orientation + delt[m][slot]
 *       Neither needs to know anything about the cubies we are not tracking.
 *
 *   slot-centric orientation parts (EDGE_ORIENT / CORNER_ORIENT)
 *       state  = orientation of whatever cubie occupies each tracked slot
 *       move   = value arriving at slot s <- value that was at src[m][s],
 *                plus deltFrom[m][s]
 *       Legal only when every slot of that cubie type is tracked, otherwise a
 *       move could bring in a cubie whose orientation we never recorded.
 *       Tracking all of them also unlocks the parity reduction (total flip is
 *       even, total twist is 0 mod 3, both invariant under every move
 *       including slices and rotations), which is what makes EO 2048 states
 *       instead of 4096 and CO 2187 instead of 6561.
 * ================================================================== */
#define MAX_COORDS 1024

typedef struct {
  int32_t kind;
  int32_t items[QF_EDGES]; int32_t n;
  int32_t allowed[QF_EDGES]; int32_t na;
  int32_t unordered;
  /* derived */
  int32_t with_orient;             /* piece-centric part also stores orientation */
  int32_t reduced;                 /* slot-centric orientation parity reduction */
  int32_t ndigit;                  /* orientation digits actually encoded */
  int32_t base;                    /* 8 for edges, 0 for corners */
  int32_t universe;                /* 12 or 8 */
  int32_t radix;                   /* 2 or 3 */
  int8_t  rank[QF_SLOTS];          /* slot id -> rank inside allowed[] */
  uint64_t perm_size;              /* placement part of the size */
  uint64_t orient_span;            /* radix^ndigit (or radix^n when piece-centric) */
  uint64_t psize;                  /* perm_size * orient_span */
  uint64_t mult[QF_EDGES + 1];     /* Lehmer multipliers */
  uint64_t omult[QF_EDGES + 1];    /* orientation digit multipliers, little endian */
  uint64_t pmult;                  /* this part's multiplier inside the coord */
  /* Precomputed transition tables. The BFS inner loop runs
   * (states x moves x parts) times, so nothing in it may search: every
   * "where does this digit come from / go to" question is answered here once,
   * at coordinate-construction time. */
  int8_t pmove[QF_NMOVES][QF_EDGES];   /* perm part: rank r -> rank r' (-1 = left the allowed set) */
  int8_t podlt[QF_NMOVES][QF_EDGES];   /* perm+orient part: rank r -> orientation delta */
  int8_t osrc[QF_NMOVES][QF_EDGES];    /* slot-orient part: item i -> source item index */
  int8_t osdlt[QF_NMOVES][QF_EDGES];   /* slot-orient part: item i -> orientation delta */
} CPart;

typedef struct {
  CPart part[QF_MAX_PARTS];
  int32_t npart;
  uint64_t size;
  int32_t in_use;
} Coord;

static Coord g_coord[MAX_COORDS];
static int g_ncoord = 0;

static uint64_t fact(int n) { uint64_t r = 1; while (n > 1) r *= (uint64_t)(n--); return r; }
static uint64_t nPr(int n, int r) { return (r > n || r < 0) ? 0 : fact(n) / fact(n - r); }

/* nCr is called once per digit per transition inside BFS, i.e. billions of
 * times over a run, so it must be a table lookup and never a factorial. */
static uint64_t g_binom[20][20];
static int g_binom_ready = 0;
static void build_binom(void) {
  int n, k;
  for (n = 0; n < 20; n++) {
    g_binom[n][0] = g_binom[n][n] = 1;
    for (k = 1; k < n; k++) g_binom[n][k] = g_binom[n-1][k-1] + g_binom[n-1][k];
  }
  g_binom_ready = 1;
}
static uint64_t nCr(int n, int r) {
  if (r < 0 || n < 0 || r > n) return 0;
  if (!g_binom_ready) build_binom();
  if (n < 20) return g_binom[n][r];
  return fact(n) / (fact(r) * fact(n - r));
}

static int part_is_perm(const CPart *p) {
  return p->kind == QF_PART_EDGE_PERM || p->kind == QF_PART_CORNER_PERM ||
         p->kind == QF_PART_EDGE_PERM_ORIENT || p->kind == QF_PART_CORNER_PERM_ORIENT;
}
static int part_is_slot_orient(const CPart *p) {
  return p->kind == QF_PART_EDGE_ORIENT || p->kind == QF_PART_CORNER_ORIENT;
}

QfCoord qf_coord_new(const QfCoordSpec *sp) {
  if (!g_inited && qf_init() != 0) return -1;
  if (g_ncoord >= MAX_COORDS) return -2;
  if (sp->npart <= 0 || sp->npart > QF_MAX_PARTS) return -4;
  Coord *c = &g_coord[g_ncoord];
  memset(c, 0, sizeof(*c));
  int p, i;
  c->npart = sp->npart;

  for (p = 0; p < sp->npart; p++) {
    const QfPart *src = &sp->part[p];
    CPart *d = &c->part[p];
    int is_edge = (src->kind == QF_PART_EDGE_PERM || src->kind == QF_PART_EDGE_PERM_ORIENT ||
                   src->kind == QF_PART_EDGE_ORIENT);
    d->kind = src->kind;
    d->n = src->n;
    d->na = src->na;
    d->unordered = src->unordered;
    d->base = is_edge ? 8 : 0;
    d->universe = is_edge ? QF_EDGES : QF_CORNERS;
    d->radix = (src->kind == QF_PART_EDGE_PERM_ORIENT || src->kind == QF_PART_EDGE_ORIENT) ? 2 : 3;
    d->with_orient = (src->kind == QF_PART_EDGE_PERM_ORIENT || src->kind == QF_PART_CORNER_PERM_ORIENT);
    if (src->kind < 0 || src->kind > 5) return -5;
    if (d->n <= 0 || d->n > d->universe) return -5;
    if (d->na > d->universe || d->na < 0) return -5;
    if (part_is_perm(d) && d->na > 0 && d->na < d->n) return -5;
    if (part_is_slot_orient(d) && d->n != d->universe) return -7;  /* not closed */
    for (i = 0; i < QF_SLOTS; i++) d->rank[i] = -1;
    for (i = 0; i < d->n; i++) {
      d->items[i] = src->items[i];
      if (d->items[i] < d->base || d->items[i] >= d->base + d->universe) return -5;
    }
    for (i = 0; i < d->na; i++) {
      d->allowed[i] = src->allowed[i];
      if (d->allowed[i] < d->base || d->allowed[i] >= d->base + d->universe) return -5;
      d->rank[d->allowed[i]] = (int8_t)i;
    }

    if (part_is_slot_orient(d)) {
      uint8_t seen[QF_SLOTS] = {0};
      d->reduced = 1;
      for (i = 0; i < d->n; i++) { if (seen[d->items[i]]) { d->reduced = 0; break; } seen[d->items[i]] = 1; }
      if (d->reduced) for (i = d->base; i < d->base + d->universe; i++) if (!seen[i]) d->reduced = 0;
    } else {
      d->reduced = 0;
    }
    if (part_is_perm(d)) d->ndigit = d->with_orient ? d->n : 0;
    else                 d->ndigit = d->reduced ? d->n - 1 : d->n;

    int N = d->na > 0 ? d->na : d->universe;
    if (part_is_perm(d)) {
      d->perm_size = d->unordered ? nCr(N, d->n) : nPr(N, d->n);
      uint64_t acc = 1;
      for (i = d->n - 1; i >= 0; i--) { d->mult[i] = acc; acc *= (uint64_t)(N - i); }
    } else {
      d->perm_size = 1;
    }
    {
      uint64_t acc = 1;
      for (i = 0; i < d->ndigit; i++) { d->omult[i] = acc; acc *= (uint64_t)d->radix; }
      d->orient_span = acc;
    }
    d->psize = d->perm_size * d->orient_span;
    if (d->psize == 0) return -6;
  }

  uint64_t total = 1;
  for (p = 0; p < c->npart; p++) { c->part[p].pmult = total; total *= c->part[p].psize; }
  if (total > (1ULL << 33)) return -3;      /* refuse absurd tables */
  c->size = total;

  for (p = 0; p < c->npart; p++) {
    CPart *d = &c->part[p];
    int m, r;
    for (m = 0; m < QF_NMOVES; m++) {
      if (part_is_perm(d)) {
        int N = d->na > 0 ? d->na : d->universe;
        for (r = 0; r < N; r++) {
          int slot = (d->na > 0) ? d->allowed[r] : (d->base + r);
          int ns = g_dest[m][slot];
          d->pmove[m][r] = (int8_t)((d->na > 0) ? d->rank[ns] : (ns - d->base));
          d->podlt[m][r] = (int8_t)(d->with_orient ? g_delt[m][slot] : 0);
        }
        for (; r < QF_EDGES; r++) { d->pmove[m][r] = -1; d->podlt[m][r] = 0; }
      } else {
        for (r = 0; r < d->n; r++) {
          int sl = d->items[r], src = g_src[m][sl], q;
          for (q = 0; q < d->n; q++) if (d->items[q] == src) break;
          d->osrc[m][r] = (int8_t)(q < d->n ? q : -1);
          d->osdlt[m][r] = (int8_t)g_deltFrom[m][sl];
        }
        for (; r < QF_EDGES; r++) { d->osrc[m][r] = -1; d->osdlt[m][r] = 0; }
      }
    }
  }

  c->in_use = 1;
  return g_ncoord++;
}

int qf_coord_size(QfCoord co, uint64_t *out) {
  if (co < 0 || co >= g_ncoord || !g_coord[co].in_use) return -1;
  *out = g_coord[co].size;
  return 0;
}

/* d[i]      = placement rank of items[i]      (perm parts, i < n)
 * d[n + i]  = orientation of items[i]         (piece-centric perm+orient parts)
 * d[i]      = orientation of slot items[i]    (slot-centric orient parts)
 */
typedef struct { int8_t d[QF_MAX_PARTS][2 * QF_EDGES + 2]; } CoordVal;

static uint64_t part_encode(const CPart *k, const int8_t *v) {
  int i;
  uint64_t perm = 0, orient = 0;
  if (part_is_perm(k)) {
    if (k->unordered) {
      int8_t so[QF_EDGES]; int a, b;
      for (a = 0; a < k->n; a++) { if (v[a] < 0) return QF_BAD_IDX; so[a] = v[a]; }
      for (a = 0; a < k->n; a++) for (b = a + 1; b < k->n; b++)
        if (so[b] < so[a]) { int8_t t = so[a]; so[a] = so[b]; so[b] = t; }
      for (a = 0; a < k->n; a++) perm += nCr(so[a], a + 1);
    } else {
      int N = k->na > 0 ? k->na : k->universe;
      uint32_t used = 0;
      for (i = 0; i < k->n; i++) {
        int rk = v[i];
        if (rk < 0 || rk >= N) return QF_BAD_IDX;
        /* count unused ranks below rk: one popcount instead of a scan */
        uint32_t below = used & ((1u << rk) - 1u);
        int cnt = rk - __builtin_popcount(below);
        used |= 1u << rk;
        perm += (uint64_t)cnt * k->mult[i];
      }
    }
  }
  {
    int nd = k->with_orient ? k->n : k->ndigit;
    for (i = 0; i < nd; i++) {
      int o = k->with_orient ? v[k->n + i] : v[i];
      if (o < 0) return QF_BAD_IDX;
      orient += (uint64_t)o * k->omult[i];
    }
  }
  return perm * k->orient_span + orient;
}

static void part_decode(const CPart *k, uint64_t r, int8_t *v) {
  int i;
  memset(v, 0, (size_t)(2 * k->n + 2));
  uint64_t orient = r % k->orient_span;
  uint64_t perm = r / k->orient_span;

  if (part_is_perm(k)) {
    int N = k->na > 0 ? k->na : k->universe;
    if (k->unordered) {
      int a;
      for (a = k->n - 1; a >= 0; a--) {
        int best = -1, vv;
        for (vv = N - 1; vv >= 0; vv--) { uint64_t cc = nCr(vv, a + 1); if (cc <= perm) { best = vv; perm -= cc; break; } }
        v[a] = (int8_t)best;
      }
    } else {
      uint32_t avail = (N >= 32) ? 0xFFFFFFFFu : ((1u << N) - 1u);
      for (i = 0; i < k->n; i++) {
        uint64_t q = perm / k->mult[i]; perm %= k->mult[i];
        /* select the (q+1)-th available rank */
        uint32_t x = avail; int r = 0; uint64_t t;
        for (t = 0; t <= q; t++) { r = __builtin_ctz(x); x &= x - 1u; }
        v[i] = (int8_t)r;
        avail &= ~(1u << r);
      }
    }
  }
  {
    int nd = k->with_orient ? k->n : k->ndigit;
    for (i = 0; i < nd; i++) {
      int8_t dig = (int8_t)(orient % (uint64_t)k->radix);
      orient /= (uint64_t)k->radix;
      if (k->with_orient) v[k->n + i] = dig; else v[i] = dig;
    }
    if (k->reduced) {
      if (k->radix == 2) { int x = 0; for (i = 0; i < nd; i++) x ^= v[i]; v[nd] = (int8_t)x; }
      else { int s = 0; for (i = 0; i < nd; i++) s += v[i]; v[nd] = (int8_t)((3 - (s % 3)) % 3); }
    }
  }
}

static void part_apply(const CPart *k, const int8_t *in, int m, int8_t *out) {
  int i;
  if (part_is_perm(k)) {
    const int8_t *pm = k->pmove[m];
    if (k->with_orient) {
      const int8_t *pd = k->podlt[m];
      for (i = 0; i < k->n; i++) {
        int r = in[i];
        out[i] = pm[r];
        out[k->n + i] = (int8_t)((in[k->n + i] + pd[r]) % k->radix);
      }
    } else {
      for (i = 0; i < k->n; i++) out[i] = pm[in[i]];
    }
  } else {
    const int8_t *sr = k->osrc[m], *dl = k->osdlt[m];
    for (i = 0; i < k->n; i++) {
      int q = sr[i];
      out[i] = (q >= 0) ? (int8_t)((in[q] + dl[i]) % k->radix) : (int8_t)-1;
    }
  }
}

static uint64_t part_index_from_pmap(const CPart *k, const QfPMap *m, int8_t *v) {
  int i;
  if (part_is_perm(k)) {
    for (i = 0; i < k->n; i++) {
      int slot = m->slotof[k->items[i]];
      if (slot < 0) return QF_BAD_IDX;
      int r = (k->na > 0) ? k->rank[slot] : (slot - k->base);
      if (r < 0) return QF_BAD_IDX;
      v[i] = (int8_t)r;
      if (k->with_orient) v[k->n + i] = m->orient[slot];
    }
  } else {
    for (i = 0; i < k->n; i++) v[i] = m->orient[k->items[i]];
  }
  return 0;
}

uint64_t qf_coord_index_pm(QfCoord co, const QfPMap *m) {
  if (co < 0 || co >= g_ncoord || !g_coord[co].in_use) return QF_BAD_IDX;
  const Coord *k = &g_coord[co];
  uint64_t idx = 0;
  int p;
  int8_t v[2 * QF_EDGES + 2];
  for (p = 0; p < k->npart; p++) {
    if (part_index_from_pmap(&k->part[p], m, v) == QF_BAD_IDX) return QF_BAD_IDX;
    uint64_t r = part_encode(&k->part[p], v);
    if (r == QF_BAD_IDX) return QF_BAD_IDX;
    idx += r * k->part[p].pmult;
  }
  return idx;
}

uint64_t qf_coord_index(QfCoord co, const QfCube *c) {
  QfPMap m;
  qf_pmap(c, &m);
  return qf_coord_index_pm(co, &m);
}

/* ================================================================== *
 * BFS distance tables
 * ================================================================== */
#define MAX_TABLES 512
typedef struct { Coord co; uint8_t *d; uint8_t *tmv; uint32_t *tpar;
                 uint64_t size, mask, from, reachable; int in_use, traced; } Table;
static Table g_tab[MAX_TABLES];

static uint64_t coord_encode_val(const Coord *k, const CoordVal *v) {
  uint64_t idx = 0; int p;
  for (p = 0; p < k->npart; p++) {
    uint64_t r = part_encode(&k->part[p], v->d[p]);
    if (r == QF_BAD_IDX) return QF_BAD_IDX;
    idx += r * k->part[p].pmult;
  }
  return idx;
}

static void coord_decode(const Coord *k, uint64_t idx, CoordVal *v) {
  int p;
  for (p = k->npart - 1; p >= 0; p--) {
    uint64_t r = idx / k->part[p].pmult;
    idx %= k->part[p].pmult;
    part_decode(&k->part[p], r, v->d[p]);
  }
}

static void coord_apply(const Coord *k, const CoordVal *in, int m, CoordVal *out) {
  int p;
  for (p = 0; p < k->npart; p++) part_apply(&k->part[p], in->d[p], m, out->d[p]);
}

static QfTable bfs_core(QfCoord co, const uint64_t *seeds, int nseeds,
                        uint64_t mask, uint64_t max_size, int traced) {
  if (co < 0 || co >= g_ncoord || !g_coord[co].in_use) return -1;
  const Coord *k = &g_coord[co];
  if (k->size > max_size) return -2;
  if (nseeds <= 0) return -3;
  int t, si;
  for (t = 0; t < MAX_TABLES; t++) if (!g_tab[t].in_use) break;
  if (t >= MAX_TABLES) return -4;
  uint8_t *d = (uint8_t *)malloc((size_t)k->size);
  if (!d) return -5;
  memset(d, QF_UNKNOWN, (size_t)k->size);
  uint8_t *tmv = NULL; uint32_t *tpar = NULL;
  if (traced) {
    tmv = (uint8_t *)malloc((size_t)k->size);
    tpar = (uint32_t *)malloc(sizeof(uint32_t) * (size_t)k->size);
    if (!tmv || !tpar) { free(d); free(tmv); free(tpar); return -5; }
    memset(tmv, 0xFF, (size_t)k->size);
  }
  /* The frontier grows on demand instead of being sized for the whole
     coordinate: a 278M-state table would otherwise need 2.2 GB of queue for a
     frontier that never exceeds a few million entries. */
  uint64_t fcap = k->size < (1ULL << 18) ? k->size : (1ULL << 18);
  uint32_t *fa = (uint32_t *)malloc(sizeof(uint32_t) * (size_t)fcap);
  uint32_t *fb = (uint32_t *)malloc(sizeof(uint32_t) * (size_t)fcap);
  if (!fa || !fb) { free(d); free(tmv); free(tpar); free(fa); free(fb); return -5; }
  uint64_t nf = 0, reached = 0;
  for (si = 0; si < nseeds; si++) {
    uint64_t idx = seeds[si];
    if (idx >= k->size || d[idx] != QF_UNKNOWN) continue;
    d[idx] = 0; fa[nf++] = (uint32_t)idx; reached++;
    if (traced) { tmv[idx] = 0xFE; tpar[idx] = (uint32_t)idx; }
  }
  if (nf == 0) { free(d); free(tmv); free(tpar); free(fa); free(fb); return -3; }
  uint8_t depth = 0;
  CoordVal v, w;
  /* BFS does a single pass over the coordinate, so a precomputed transition
     table would cost one full decode/apply/encode pass to build and never pay
     back -- it is only worth it for contexts that look up transitions many
     times (the book sweep's DFS, IDA*). BFS therefore uses the decode/apply/
     encode path directly, with the single-part fast paths in coord_decode and
     coord_encode_val. */
  while (nf > 0 && depth < 254) {
    uint64_t nn = 0, i2;
    depth++;
    for (i2 = 0; i2 < nf; i2++) {
      uint32_t cur = fa[i2];
      coord_decode(k, cur, &v);
      int m;
      for (m = 0; m < QF_NMOVES; m++) {
        if (!((mask >> m) & 1ULL)) continue;
        coord_apply(k, &v, m, &w);
        uint64_t nidx = coord_encode_val(k, &w);
        if (nidx == QF_BAD_IDX || nidx >= k->size) continue;
        if (d[nidx] == QF_UNKNOWN) {
          if (nn == fcap) {
            uint64_t want = fcap * 2;
            if (want > k->size) want = k->size;
            uint32_t *na = (uint32_t *)realloc(fa, sizeof(uint32_t) * (size_t)want);
            uint32_t *nb = (uint32_t *)realloc(fb, sizeof(uint32_t) * (size_t)want);
            if (!na || !nb) {
              free(na ? na : fa); free(nb ? nb : fb); free(d); free(tmv); free(tpar);
              return -5;
            }
            fa = na; fb = nb; fcap = want;
          }
          d[nidx] = depth; fb[nn++] = (uint32_t)nidx; reached++;
          if (traced) { tmv[nidx] = (uint8_t)m; tpar[nidx] = cur; }
        }
      }
    }
    uint32_t *tmp = fa; fa = fb; fb = tmp;
    nf = nn;
  }
  free(fa); free(fb);
  g_tab[t].co = *k; g_tab[t].d = d; g_tab[t].tmv = tmv; g_tab[t].tpar = tpar;
  g_tab[t].size = k->size; g_tab[t].mask = mask; g_tab[t].from = seeds[0];
  g_tab[t].reachable = reached; g_tab[t].in_use = 1; g_tab[t].traced = traced;
  return t;
}

QfTable qf_table_build_multi(QfCoord co, const uint64_t *seeds, int nseeds,
                             uint64_t mask, uint64_t max_size) {
  return bfs_core(co, seeds, nseeds, mask, max_size, 0);
}

QfTable qf_table_build_traced(QfCoord co, const uint64_t *seeds, int nseeds,
                              uint64_t mask, uint64_t max_size) {
  return bfs_core(co, seeds, nseeds, mask, max_size, 1);
}

int qf_table_is_traced(QfTable t) {
  return (t >= 0 && t < MAX_TABLES && g_tab[t].in_use) ? g_tab[t].traced : 0;
}

int qf_table_path(QfTable t, uint64_t idx, int *out, int cap) {
  if (t < 0 || t >= MAX_TABLES || !g_tab[t].in_use || !g_tab[t].traced) return -1;
  if (idx >= g_tab[t].size || g_tab[t].d[idx] == QF_UNKNOWN) return -1;
  int buf[QF_SOL_MAX * 4], n = 0;
  uint32_t cur = (uint32_t)idx;
  while (g_tab[t].tmv[cur] != 0xFE) {
    if (n >= (int)(sizeof(buf) / sizeof(buf[0])) - 1) return -1;
    buf[n++] = g_tab[t].tmv[cur];
    uint32_t par = g_tab[t].tpar[cur];
    if (par == cur) return -1;
    cur = par;
  }
  if (n > cap) return -1;
  int i;
  for (i = 0; i < n; i++) out[i] = buf[n - 1 - i];
  return n;
}

QfTable qf_table_build(QfCoord co, uint64_t from_index, uint64_t mask, uint64_t max_size) {
  if (from_index >= (uint64_t)1 << 33) return -3;
  uint64_t seed = from_index;
  return bfs_core(co, &seed, 1, mask, max_size, 0);
}

QfTable qf_table_build_solved(QfCoord co, uint64_t mask, uint64_t max_size) {
  if (co < 0 || co >= g_ncoord) return -1;
  QfCube sv; qf_solved(&sv);
  uint64_t idx = qf_coord_index(co, &sv);
  if (idx == QF_BAD_IDX) return -3;
  return qf_table_build(co, idx, mask, max_size);
}

uint64_t qf_coord_apply_index(QfCoord co, uint64_t idx, int move) {
  if (co < 0 || co >= g_ncoord || !g_coord[co].in_use) return QF_BAD_IDX;
  const Coord *k = &g_coord[co];
  if (idx >= k->size) return QF_BAD_IDX;
  CoordVal v, w;
  coord_decode(k, idx, &v);
  coord_apply(k, &v, move, &w);
  return coord_encode_val(k, &w);
}

void qf_coord_apply_index_batch(QfCoord co, const uint64_t *in, uint64_t *out,
                                uint64_t n, int move) {
  uint64_t i;
  for (i = 0; i < n; i++) out[i] = qf_coord_apply_index(co, in[i], move);
}

int qf_table_lookup(QfTable t, uint64_t idx) {
  if (t < 0 || t >= MAX_TABLES || !g_tab[t].in_use || idx >= g_tab[t].size) return -1;
  return g_tab[t].d[idx];
}
uint64_t qf_table_size(QfTable t) {
  return (t < 0 || t >= MAX_TABLES || !g_tab[t].in_use) ? 0 : g_tab[t].size;
}
uint64_t qf_table_reachable(QfTable t) {
  return (t < 0 || t >= MAX_TABLES || !g_tab[t].in_use) ? 0 : g_tab[t].reachable;
}
void qf_table_hist(QfTable t, uint64_t *hist, int hist_n) {
  int i; uint64_t j;
  for (i = 0; i < hist_n; i++) hist[i] = 0;
  if (t < 0 || t >= MAX_TABLES || !g_tab[t].in_use) return;
  for (j = 0; j < g_tab[t].size; j++) { int d = g_tab[t].d[j]; if (d < hist_n) hist[d]++; }
}
const uint8_t *qf_table_data(QfTable t) {
  return (t >= 0 && t < MAX_TABLES && g_tab[t].in_use) ? g_tab[t].d : NULL;
}

void qf_table_free(QfTable t) {
  if (t < 0 || t >= MAX_TABLES || !g_tab[t].in_use) return;
  free(g_tab[t].d); free(g_tab[t].tmv); free(g_tab[t].tpar);
  g_tab[t].in_use = 0;
}

int qf_table_save(QfTable t, const char *path) {
  if (t < 0 || t >= MAX_TABLES || !g_tab[t].in_use) return -1;
  FILE *fp = fopen(path, "wb");
  if (!fp) return -2;
  const Table *T = &g_tab[t];
  fwrite("QFOXTAB4", 1, 8, fp);
  fwrite(&T->co, sizeof(Coord), 1, fp);
  fwrite(&T->mask, 8, 1, fp);
  fwrite(&T->from, 8, 1, fp);
  fwrite(&T->size, 8, 1, fp);
  fwrite(T->d, 1, (size_t)T->size, fp);
  fclose(fp);
  return 0;
}

QfTable qf_table_load(QfCoord co, const char *path) {
  FILE *fp = fopen(path, "rb");
  char magic[8];
  if (!fp) return -1;
  if (fread(magic, 1, 8, fp) != 8 || memcmp(magic, "QFOXTAB4", 8) != 0) { fclose(fp); return -2; }
  Table T;
  memset(&T, 0, sizeof(T));          /* never carry uninitialised trace pointers */
  if (fread(&T.co, sizeof(Coord), 1, fp) != 1) { fclose(fp); return -2; }
  if (co >= 0 && co < g_ncoord && memcmp(&T.co, &g_coord[co], sizeof(Coord)) != 0) { fclose(fp); return -3; }
  if (fread(&T.mask, 8, 1, fp) != 1) { fclose(fp); return -2; }
  if (fread(&T.from, 8, 1, fp) != 1) { fclose(fp); return -2; }
  if (fread(&T.size, 8, 1, fp) != 1) { fclose(fp); return -2; }
  T.d = (uint8_t *)malloc((size_t)T.size);
  if (!T.d) { fclose(fp); return -5; }
  if (fread(T.d, 1, (size_t)T.size, fp) != (size_t)T.size) { free(T.d); fclose(fp); return -2; }
  fclose(fp);
  int t;
  for (t = 0; t < MAX_TABLES; t++) if (!g_tab[t].in_use) break;
  if (t >= MAX_TABLES) { free(T.d); return -4; }
  uint64_t j; T.reachable = 0;
  for (j = 0; j < T.size; j++) if (T.d[j] != QF_UNKNOWN) T.reachable++;
  T.in_use = 1;
  g_tab[t] = T;
  return t;
}

/* ================================================================== *
 * IDA*
 * ================================================================== */
typedef struct {
  const QfStage *st;
  int movelist[QF_NMOVES], nmoves;
  long long budget, nodes;
  int hit_budget;
  int sol[QF_SOL_MAX];
  int soln;                       /* true depth of the solution just found */
  QfPMap pmap[QF_SOL_MAX + 1];   /* pmap-only search: the cube is never carried */
  /* collect mode */
  int collecting;
  QfSolutionSet *set;
  int limit;
} IdaCtx;

static int stage_h(const IdaCtx *ctx, int depth) {
  const QfStage *st = ctx->st;
  const QfPMap *m = &ctx->pmap[depth];
  int h = 0, i;
  for (i = 0; i < st->nheur; i++) {
    QfTable tb = st->heur_table[i];
    if (tb < 0 || tb >= MAX_TABLES || !g_tab[tb].in_use) continue;
    uint64_t idx = qf_coord_index_pm(st->heur[i], m);
    if (idx == QF_BAD_IDX || idx >= g_tab[tb].size) return 99;
    int d = g_tab[tb].d[idx];
    if (d == QF_UNKNOWN) return 99;
    if (d > h) h = d;
  }
  return h;
}

static int stage_goal(const IdaCtx *ctx, int depth) {
  const QfStage *st = ctx->st;
  const QfPMap *m = &ctx->pmap[depth];
  int i;
  for (i = 0; i < st->nkeep; i++) {
    uint64_t idx = qf_coord_index_pm(st->keep[i], m);
    if (idx == QF_BAD_IDX) return 0;
    QfTable tb = st->use_keep_table ? st->keep_table[i] : -1;
    if (tb >= 0 && tb < MAX_TABLES && g_tab[tb].in_use) {
      if (idx >= g_tab[tb].size || g_tab[tb].d[idx] != 0) return 0;
    } else if (idx != st->keep_target[i]) {
      return 0;
    }
  }
  return 1;
}

static int ida(IdaCtx *ctx, int depth, int bound, int last) {
  if (ctx->budget > 0 && --ctx->budget <= 0) { ctx->hit_budget = 1; return -1; }
  ctx->nodes++;
  int h = stage_h(ctx, depth);
  if (h > 90) return -1;
  if (depth + h > bound) return -1;
  if (h == 0 && stage_goal(ctx, depth)) {
    ctx->soln = depth;
    if (!ctx->collecting) return 0;
    if (ctx->set && ctx->set->n < ctx->limit && ctx->set->n < QF_MAX_COLLECT) {
      int q;
      ctx->set->len[ctx->set->n] = depth;
      for (q = 0; q < depth; q++) ctx->set->moves[ctx->set->n][q] = ctx->sol[q];
      ctx->set->n++;
    } else if (ctx->set) {
      ctx->set->truncated = 1;
      return 0;                 /* full: stop, do not walk the rest of the tree */
    }
    return -1;                  /* keep enumerating */
  }
  if (depth >= QF_SOL_MAX - 1) return -1;
  int i;
  for (i = 0; i < ctx->nmoves; i++) {
    int m = ctx->movelist[i];
    if (last >= 0) {
      int lf = last / 3, cf = m / 3;
      if (lf == cf) continue;
      if (g_axis[last] == g_axis[m] && lf > cf) continue;
    }
    ctx->pmap[depth + 1] = ctx->pmap[depth];
    qf_pmap_apply(&ctx->pmap[depth + 1], m);
    ctx->sol[depth] = m;
    int r = ida(ctx, depth + 1, bound, m);
    if (r == 0) return 0;
    if (ctx->hit_budget) return -1;
  }
  return -1;
}

static int stage_setup(IdaCtx *ctx, const QfStage *st) {
  uint64_t mask = st->mask;
  int m;
  memset(ctx, 0, sizeof(*ctx));
  ctx->st = st;
  if (!st->allow_rotations) mask &= ~QF_MASK_ROT;
  if (mask == 0) return -1;
  for (m = 0; m < QF_NMOVES; m++) if ((mask >> m) & 1ULL) ctx->movelist[ctx->nmoves++] = m;
  ctx->budget = st->node_budget;
  return 0;
}

int qf_solve_stage(const QfCube *start, const QfStage *st, QfSolution *out) {
  IdaCtx ctx;
  memset(out, 0, sizeof(*out));
  if (stage_setup(&ctx, st) != 0) { out->status = 2; return 2; }
  int m;
  int maxd = st->max_depth > QF_SOL_MAX ? QF_SOL_MAX : st->max_depth;

  qf_pmap(start, &ctx.pmap[0]);
  if (stage_h(&ctx, 0) == 0 && stage_goal(&ctx, 0)) { out->n = 0; out->optimal = 1; out->status = 0; return 0; }

  int bound;
  for (bound = 0; bound <= maxd; bound++) {
    ctx.hit_budget = 0;
    int r = ida(&ctx, 0, bound, -1);
    if (r == 0) {
      out->n = ctx.soln;
      for (m = 0; m < ctx.soln; m++) out->moves[m] = ctx.sol[m];
      out->optimal = 1;
      out->nodes = ctx.nodes;
      out->status = 0;
      return 0;
    }
    if (ctx.hit_budget) { out->status = 1; out->nodes = ctx.nodes; return 1; }
  }
  out->status = 2;
  out->nodes = ctx.nodes;
  return 2;
}

int qf_enumerate_stage(const QfCube *start, const QfStage *st, int max_len,
                       int limit, QfSolutionSet *out) {

  IdaCtx ctx;
  memset(out, 0, sizeof(*out));
  if (stage_setup(&ctx, st) != 0) { out->truncated = 1; return -1; }
  ctx.collecting = 1;
  ctx.set = out;
  ctx.limit = limit > QF_MAX_COLLECT ? QF_MAX_COLLECT : limit;
  qf_pmap(start, &ctx.pmap[0]);
  if (max_len > QF_SOL_MAX - 1) max_len = QF_SOL_MAX - 1;
  int bound;
  for (bound = 0; bound <= max_len; bound++) {
    if (out->n >= ctx.limit) break;
    ctx.hit_budget = 0;
    ida(&ctx, 0, bound, -1);
    if (ctx.hit_budget) { out->truncated = 1; break; }
  }
  return out->n;
}

/* ================================================================== *
 * whole-cube two-phase reference solver
 *
 * Not the point of the project, but it gives us an independent near-optimal
 * move count per scramble, which is the floor every method is compared to.
 * ================================================================== */
static QfCoord g_c1a = -1, g_c1b = -1, g_c2a = -1, g_c2b = -1;
static QfTable g_t1a = -1, g_t1b = -1, g_t2a = -1, g_t2b = -1;
static uint64_t g_tgt1a, g_tgt1b, g_tgt2a, g_tgt2b;
static uint64_t g_p2mask;
static int g_full_ready = 0;

static int edge_slot(const char *nm) { return qf_slot_id(nm); }

int qf_fullsolver_prepare(uint64_t max_table_size) {
  if (g_full_ready) return 0;
  if (!g_inited && qf_init() != 0) return -1;
  int i;
  int all_e[QF_EDGES], all_c[QF_CORNERS];
  for (i = 0; i < QF_EDGES; i++) all_e[i] = 8 + i;
  for (i = 0; i < QF_CORNERS; i++) all_c[i] = i;

  int slice_p[4], slice_s[4], ud_p[8], ud_s[8], n = 0;
  const char *snm[4] = {"FR", "FL", "BL", "BR"};
  for (i = 0; i < 4; i++) { slice_p[i] = edge_slot(snm[i]); slice_s[i] = slice_p[i]; }
  for (i = 0; i < QF_EDGES; i++) {
    int s = 8 + i, q, is_slice = 0;
    for (q = 0; q < 4; q++) if (slice_s[q] == s) is_slice = 1;
    if (!is_slice) { ud_p[n] = s; ud_s[n] = s; n++; }
  }

  QfCoordSpec sp;
  memset(&sp, 0, sizeof(sp));
  sp.npart = 2;
  sp.part[0].kind = QF_PART_EDGE_ORIENT;
  sp.part[0].n = QF_EDGES; for (i = 0; i < QF_EDGES; i++) sp.part[0].items[i] = all_e[i];
  sp.part[1].kind = QF_PART_EDGE_PERM; sp.part[1].unordered = 1;
  sp.part[1].n = 4; for (i = 0; i < 4; i++) sp.part[1].items[i] = slice_p[i];
  g_c1a = qf_coord_new(&sp);

  memset(&sp, 0, sizeof(sp));
  sp.npart = 2;
  sp.part[0].kind = QF_PART_CORNER_ORIENT;
  sp.part[0].n = QF_CORNERS; for (i = 0; i < QF_CORNERS; i++) sp.part[0].items[i] = all_c[i];
  sp.part[1].kind = QF_PART_EDGE_PERM; sp.part[1].unordered = 1;
  sp.part[1].n = 4; for (i = 0; i < 4; i++) sp.part[1].items[i] = slice_p[i];
  g_c1b = qf_coord_new(&sp);

  /* phase 2 prune table A: UD edge permutation x slice permutation */
  memset(&sp, 0, sizeof(sp));
  sp.npart = 2;
  sp.part[0].kind = QF_PART_EDGE_PERM; sp.part[0].n = 8; sp.part[0].na = 8;
  for (i = 0; i < 8; i++) { sp.part[0].items[i] = ud_p[i]; sp.part[0].allowed[i] = ud_s[i]; }
  sp.part[1].kind = QF_PART_EDGE_PERM; sp.part[1].n = 4; sp.part[1].na = 4;
  for (i = 0; i < 4; i++) { sp.part[1].items[i] = slice_p[i]; sp.part[1].allowed[i] = slice_s[i]; }
  g_c2a = qf_coord_new(&sp);

  /* phase 2 prune table B: corner permutation x slice permutation */
  memset(&sp, 0, sizeof(sp));
  sp.npart = 2;
  sp.part[0].kind = QF_PART_CORNER_PERM; sp.part[0].n = QF_CORNERS;
  for (i = 0; i < QF_CORNERS; i++) sp.part[0].items[i] = all_c[i];
  sp.part[1].kind = QF_PART_EDGE_PERM; sp.part[1].n = 4; sp.part[1].na = 4;
  for (i = 0; i < 4; i++) { sp.part[1].items[i] = slice_p[i]; sp.part[1].allowed[i] = slice_s[i]; }
  g_c2b = qf_coord_new(&sp);

  if (g_c1a < 0 || g_c1b < 0 || g_c2a < 0 || g_c2b < 0) return -2;

  g_p2mask = QF_MK_U | QF_MK_D | (1ULL << QF_R2) | (1ULL << QF_L2) | (1ULL << QF_F2) | (1ULL << QF_B2);
  g_t1a = qf_table_build_solved(g_c1a, QF_MASK_OUTER, max_table_size);
  g_t1b = qf_table_build_solved(g_c1b, QF_MASK_OUTER, max_table_size);
  g_t2a = qf_table_build_solved(g_c2a, g_p2mask, max_table_size);
  g_t2b = qf_table_build_solved(g_c2b, g_p2mask, max_table_size);
  if (g_t1a < 0 || g_t1b < 0 || g_t2a < 0 || g_t2b < 0) return -3;

  QfCube sv; qf_solved(&sv);
  QfPMap m; qf_pmap(&sv, &m);
  g_tgt1a = qf_coord_index_pm(g_c1a, &m);
  g_tgt1b = qf_coord_index_pm(g_c1b, &m);
  g_tgt2a = qf_coord_index_pm(g_c2a, &m);
  g_tgt2b = qf_coord_index_pm(g_c2b, &m);
  g_full_ready = 1;
  return 0;
}

int qf_solve_full_phases(const QfCube *c, int *moves, int cap, int *p1len, int *p2len) {
  if (!g_full_ready && qf_fullsolver_prepare(1ULL << 24) != 0) return -1;
  QfStage st;
  QfSolution sol;
  int i;

  memset(&st, 0, sizeof(st));
  st.nkeep = 2;
  st.keep[0] = g_c1a; st.keep_target[0] = g_tgt1a;
  st.keep[1] = g_c1b; st.keep_target[1] = g_tgt1b;
  st.nheur = 2;
  st.heur[0] = g_c1a; st.heur_table[0] = g_t1a;
  st.heur[1] = g_c1b; st.heur_table[1] = g_t1b;
  st.mask = QF_MASK_OUTER;
  st.max_depth = 13;
  st.node_budget = 60000000;
  if (qf_solve_stage(c, &st, &sol) != 0) return -1;
  int L1 = sol.n;

  /* Enumerate alternative phase-1 endings. The first one found is rarely the
   * one that makes phase 2 cheapest, and phase 2 dominates the total. */
  static QfSolutionSet set;
  memset(&set, 0, sizeof(set));
  if (qf_enumerate_stage(c, &st, L1 + 1, 400, &set) <= 0) {
    set.n = 1; set.len[0] = L1;
    for (i = 0; i < L1; i++) set.moves[0][i] = sol.moves[i];
  }

  QfStage st2;
  memset(&st2, 0, sizeof(st2));
  st2.nkeep = 2;
  st2.keep[0] = g_c2a; st2.keep_target[0] = g_tgt2a;
  st2.keep[1] = g_c2b; st2.keep_target[1] = g_tgt2b;
  st2.nheur = 2;
  st2.heur[0] = g_c2a; st2.heur_table[0] = g_t2a;
  st2.heur[1] = g_c2b; st2.heur_table[1] = g_t2b;
  st2.mask = g_p2mask;
  st2.allow_rotations = 0;
  st2.node_budget = 60000000;

  int best = 1 << 30, best1 = 0, best2 = 0;
  int bestmoves[QF_SOL_MAX];
  for (i = 0; i < set.n; i++) {
    QfCube cur = *c;
    qf_apply_seq(&cur, set.moves[i], set.len[i]);
    st2.max_depth = (best < (1 << 29)) ? (best - set.len[i] - 1) : 20;
    if (st2.max_depth < 0) continue;
    if (st2.max_depth > 20) st2.max_depth = 20;
    QfSolution s2;
    if (qf_solve_stage(&cur, &st2, &s2) != 0) continue;
    if (set.len[i] + s2.n < best) {
      best = set.len[i] + s2.n;
      best1 = set.len[i]; best2 = s2.n;
      int q;
      for (q = 0; q < set.len[i]; q++) bestmoves[q] = set.moves[i][q];
      for (q = 0; q < s2.n; q++) bestmoves[best1 + q] = s2.moves[q];
      if (best <= 2) break;
    }
  }
  if (best > cap || best >= (1 << 29)) return -1;
  memcpy(moves, bestmoves, sizeof(int) * (size_t)best);
  if (p1len) *p1len = best1;
  if (p2len) *p2len = best2;
  return best;
}

int qf_solve_full(const QfCube *c, int *moves, int cap) {
  return qf_solve_full_phases(c, moves, cap, NULL, NULL);
}

/* ================================================================== *
 * self test
 *
 * Every layer of the engine is checked against the layer below it:
 *   1  moves have the right order
 *   2  slot transitions are a permutation, src is the inverse of dest
 *   3  the cheap slot-level coordinate transition equals the facelet truth
 *   4  encode(decode(x)) == x over each coordinate space
 *   5  BFS tables: target at depth 0, histogram sums to the reachable count
 *   6  BFS tables are monotone: every state at depth d has a legal move to d-1
 *   7  IDA* returns a solution whose length equals the exact table distance
 *      and which really achieves the goal when applied to the real cube
 * ================================================================== */
static uint64_t g_rng = 88172645463325252ULL;
static uint64_t rnd64(void) {
  g_rng ^= g_rng << 13; g_rng ^= g_rng >> 7; g_rng ^= g_rng << 17;
  return g_rng;
}

static QfCoord test_coord_edge_orient(void) {
  QfCoordSpec sp; int i;
  memset(&sp, 0, sizeof(sp));
  sp.npart = 1;
  sp.part[0].kind = QF_PART_EDGE_ORIENT; sp.part[0].n = QF_EDGES;
  for (i = 0; i < QF_EDGES; i++) sp.part[0].items[i] = 8 + i;
  return qf_coord_new(&sp);
}
static QfCoord test_coord_corner_orient(void) {
  QfCoordSpec sp; int i;
  memset(&sp, 0, sizeof(sp));
  sp.npart = 1;
  sp.part[0].kind = QF_PART_CORNER_ORIENT; sp.part[0].n = QF_CORNERS;
  for (i = 0; i < QF_CORNERS; i++) sp.part[0].items[i] = i;
  return qf_coord_new(&sp);
}
static QfCoord test_coord_cross(void) {
  QfCoordSpec sp;
  memset(&sp, 0, sizeof(sp));
  sp.npart = 1;
  sp.part[0].kind = QF_PART_EDGE_PERM_ORIENT; sp.part[0].n = 4;
  sp.part[0].items[0] = qf_slot_id("DF"); sp.part[0].items[1] = qf_slot_id("DL");
  sp.part[0].items[2] = qf_slot_id("DB"); sp.part[0].items[3] = qf_slot_id("DR");
  return qf_coord_new(&sp);
}
static QfCoord test_coord_corner_perm(void) {
  QfCoordSpec sp; int i;
  memset(&sp, 0, sizeof(sp));
  sp.npart = 1;
  sp.part[0].kind = QF_PART_CORNER_PERM; sp.part[0].n = QF_CORNERS;
  for (i = 0; i < QF_CORNERS; i++) sp.part[0].items[i] = i;
  return qf_coord_new(&sp);
}
static QfCoord test_coord_slice_unordered(void) {
  QfCoordSpec sp;
  memset(&sp, 0, sizeof(sp));
  sp.npart = 1;
  sp.part[0].kind = QF_PART_EDGE_PERM; sp.part[0].unordered = 1; sp.part[0].n = 4;
  sp.part[0].items[0] = qf_slot_id("FR"); sp.part[0].items[1] = qf_slot_id("FL");
  sp.part[0].items[2] = qf_slot_id("BL"); sp.part[0].items[3] = qf_slot_id("BR");
  return qf_coord_new(&sp);
}
static QfCoord test_coord_roux_block(void) {
  QfCoordSpec sp;
  memset(&sp, 0, sizeof(sp));
  sp.npart = 2;
  sp.part[0].kind = QF_PART_EDGE_PERM_ORIENT; sp.part[0].n = 3;
  sp.part[0].items[0] = qf_slot_id("DL"); sp.part[0].items[1] = qf_slot_id("BL");
  sp.part[0].items[2] = qf_slot_id("FL");
  sp.part[1].kind = QF_PART_CORNER_PERM_ORIENT; sp.part[1].n = 2;
  sp.part[1].items[0] = qf_slot_id("DLF"); sp.part[1].items[1] = qf_slot_id("ULB");
  return qf_coord_new(&sp);
}
static QfCoord test_coord_cross_plus_co(void) {
  QfCoordSpec sp; int i;
  memset(&sp, 0, sizeof(sp));
  sp.npart = 2;
  sp.part[0].kind = QF_PART_EDGE_PERM_ORIENT; sp.part[0].n = 4;
  sp.part[0].items[0] = qf_slot_id("DF"); sp.part[0].items[1] = qf_slot_id("DL");
  sp.part[0].items[2] = qf_slot_id("DB"); sp.part[0].items[3] = qf_slot_id("DR");
  sp.part[1].kind = QF_PART_CORNER_ORIENT; sp.part[1].n = QF_CORNERS;
  for (i = 0; i < QF_CORNERS; i++) sp.part[1].items[i] = i;
  return qf_coord_new(&sp);
}
static QfCoord test_coord_pair(void) {
  QfCoordSpec sp;
  memset(&sp, 0, sizeof(sp));
  sp.npart = 2;
  sp.part[0].kind = QF_PART_EDGE_PERM_ORIENT; sp.part[0].n = 1;
  sp.part[0].items[0] = qf_slot_id("FR");
  sp.part[1].kind = QF_PART_CORNER_PERM_ORIENT; sp.part[1].n = 1;
  sp.part[1].items[0] = qf_slot_id("DFR");
  return qf_coord_new(&sp);
}

int qf_abi(int which) {
  switch (which) {
    case 0: return QF_SOL_MAX;
    case 1: return QF_MAX_COLLECT;
    case 2: return QF_MAX_CONST;
    case 3: return QF_LL_N;
    case 4: return QF_LL_MAXLEN;
    case 5: return QF_NMOVES;
    case 6: return QF_SLOTS;
    case 7: return QF_FACELETS;
    case 8: return QF_MAX_PARTS;
    case 9: return MAX_TABLES;
    default: return -1;
  }
}

int qf_check_consistency(int trials) {
  if (!g_inited) {
    build_binom();
    build_geometry(); build_slots(); build_moves();
    build_piece_tables(); build_slot_transition(); build_costs();
    g_inited = 1;
  }
  int m, s, i;

  for (m = 0; m < QF_NMOVES; m++) {
    QfCube c; qf_solved(&c);
    int reps = (g_pow[m] == 2) ? 2 : 4;
    for (i = 0; i < reps; i++) qf_apply(&c, m);
    if (!qf_is_solved(&c)) return 100 + m;
  }

  /* ---- layer 0b: a move name means what the world means by it ---------- *
   * Every other check below compares the engine against itself, and a cube
   * whose U turns the wrong way passes all of them: the solver still solves,
   * the tables still agree, the book still enumerates.  The only symptom is
   * that every algorithm this project prints is mirrored in the U/D axis.
   * So pin the direction of the twelve generators that define it -- the six
   * faces plus y, x, z, E, M, S -- to standard notation (clockwise looking
   * straight at the face) by naming one cubie each must carry to one slot. */
  {
    static const int  nm[12] = { 0,  3,  6,  9, 12, 15, 48, 45, 51, 21, 18, 24};
    static const char *src[12] = {"URF","URF","ULF","DLF","ULF","URB",
                                  "URB","URF","ULF","FL", "UB", "UL"};
    static const char *dst[12] = {"ULF","URB","URF","DRF","DLF","ULB",
                                  "URF","URB","URF","FR", "UF", "UR"};
    for (i = 0; i < 12; i++) {
      QfCube c; QfPMap pm;
      int from = qf_slot_id(src[i]), to = qf_slot_id(dst[i]);
      if (from < 0 || to < 0) return 10 + i;
      qf_solved(&c);
      qf_apply(&c, nm[i]);
      qf_pmap(&c, &pm);
      if (pm.piece[to] != from) return 10 + i;
    }
  }

  for (m = 0; m < QF_NMOVES; m++) {
    uint8_t seen[QF_SLOTS] = {0};
    for (s = 0; s < QF_SLOTS; s++) {
      int d = g_dest[m][s];
      if (d < 0 || d >= QF_SLOTS || seen[d]) return 200 + m;
      seen[d] = 1;
      if (g_src[m][d] != s) return 300 + m;
      if (g_slot[s].type != g_slot[d].type) return 400 + m;
    }
  }

  QfCoord co[8];
  co[0] = test_coord_edge_orient();
  co[1] = test_coord_corner_orient();
  co[2] = test_coord_cross();
  co[3] = test_coord_corner_perm();
  co[4] = test_coord_slice_unordered();
  co[5] = test_coord_roux_block();
  co[6] = test_coord_cross_plus_co();
  co[7] = test_coord_pair();
  for (i = 0; i < 8; i++) if (co[i] < 0) return 500 + i;

  /* expected sizes: a cheap way to catch an encoder that silently changed */
  {
    uint64_t want[8], got;
    want[0] = 2048; want[1] = 2187; want[2] = 11880ULL * 16; want[3] = 40320;
    want[4] = 495; want[5] = 1320ULL * 8 * 56 * 9; want[6] = 11880ULL * 16 * 2187;
    want[7] = 12ULL * 2 * 8 * 3;
    for (i = 0; i < 8; i++) {
      if (qf_coord_size(co[i], &got) != 0) return 520 + i;
      if (got != want[i]) return 540 + i;
    }
  }

  int tr, ci;
  for (tr = 0; tr < trials; tr++) {
    QfCube c; qf_solved(&c);
    int k, nk = 1 + (int)(rnd64() % 14);
    for (k = 0; k < nk; k++) qf_apply(&c, (int)(rnd64() % QF_NMOVES));
    int mv = (int)(rnd64() % QF_NMOVES);
    QfCube dd = c; qf_apply(&dd, mv);
    QfPMap mc, md; qf_pmap(&c, &mc); qf_pmap(&dd, &md);
    for (ci = 0; ci < 8; ci++) {
      const Coord *K = &g_coord[co[ci]];
      uint64_t ic = qf_coord_index_pm(co[ci], &mc);
      uint64_t id = qf_coord_index_pm(co[ci], &md);
      if (ic == QF_BAD_IDX || id == QF_BAD_IDX) return 600 + ci;
      CoordVal v, w;
      coord_decode(K, ic, &v);
      coord_apply(K, &v, mv, &w);
      if (coord_encode_val(K, &w) != id) return 700 + ci;
    }
  }

  for (ci = 0; ci < 8; ci++) {
    const Coord *K = &g_coord[co[ci]];
    uint64_t j, step = K->size > 200000 ? K->size / 200000 : 1;
    for (j = 0; j < K->size; j += step) {
      CoordVal v;
      coord_decode(K, j, &v);
      if (coord_encode_val(K, &v) != j) return 800 + ci;
    }
  }

  /* BFS sanity + monotonicity on the edge-orientation coordinate */
  {
    QfCube sv; qf_solved(&sv);
    uint64_t tgt = qf_coord_index(co[0], &sv);
    QfTable t = qf_table_build(co[0], tgt, QF_MASK_OUTER, 1ULL << 20);
    if (t < 0) return 900;
    if (qf_table_lookup(t, tgt) != 0) { qf_table_free(t); return 901; }
    uint64_t hist[24], tot = 0; int q;
    qf_table_hist(t, hist, 24);
    for (q = 0; q < 24; q++) tot += hist[q];
    if (tot != qf_table_reachable(t)) { qf_table_free(t); return 902; }
    const Coord *K = &g_coord[co[0]];
    uint64_t j;
    CoordVal v, w;
    for (j = 0; j < K->size; j++) {
      int d = g_tab[t].d[j];
      if (d == QF_UNKNOWN || d == 0) continue;
      coord_decode(K, j, &v);
      int ok = 0;
      for (m = 0; m < QF_NMOVES && !ok; m++) {
        if (!((QF_MASK_OUTER >> m) & 1ULL)) continue;
        coord_apply(K, &v, m, &w);
        uint64_t ni = coord_encode_val(K, &w);
        if (ni != QF_BAD_IDX && ni < K->size && g_tab[t].d[ni] == d - 1) ok = 1;
      }
      if (!ok) { qf_table_free(t); return 903; }
    }
    qf_table_free(t);
  }

  /* IDA* must match the exact table distance and really work on the cube */
  {
    QfCoord cc = co[2];
    QfCube sv; qf_solved(&sv);
    uint64_t tgt = qf_coord_index(cc, &sv);
    QfTable t = qf_table_build(cc, tgt, QF_MASK_OUTER, 1ULL << 20);
    if (t < 0) return 910;
    for (tr = 0; tr < 40; tr++) {
      QfCube c; qf_solved(&c);
      int k, nk = 5 + (int)(rnd64() % 20);
      for (k = 0; k < nk; k++) qf_apply(&c, (int)(rnd64() % 18));
      QfStage st;
      memset(&st, 0, sizeof(st));
      st.nkeep = 1; st.keep[0] = cc; st.keep_target[0] = tgt;
      st.nheur = 1; st.heur[0] = cc; st.heur_table[0] = t;
      st.mask = QF_MASK_OUTER; st.max_depth = 12; st.node_budget = 5000000;
      QfSolution sol;
      int r = qf_solve_stage(&c, &st, &sol);
      if (r != 0) { qf_table_free(t); return 911; }
      uint64_t idx = qf_coord_index(cc, &c);
      int expect = qf_table_lookup(t, idx);
      if (expect == QF_UNKNOWN) expect = 99;
      if (sol.n != expect) { qf_table_free(t); return 912; }
      QfCube v = c;
      qf_apply_seq(&v, sol.moves, sol.n);
      if (qf_coord_index(cc, &v) != tgt) { qf_table_free(t); return 913; }
    }
    qf_table_free(t);
  }

  /* ---- layer 7b: rebuilding a cube from a piece map ------------------ */
  {
    int t;
    for (t = 0; t < 60; t++) {
      QfCube c; qf_solved(&c);
      int k, nm = (t * 7919) % 12 + 1;
      for (k = 0; k < nm; k++) qf_apply(&c, (t * 31 + k * 17) % 18);
      QfPMap m; qf_pmap(&c, &m);
      QfCube r;
      int rc = qf_cube_from_pmap(&m, &r);
      if (rc != 0) return 950;
      if (memcmp(c.f, r.f, QF_FACELETS) != 0) return 951;
      QfPMap m2; qf_pmap(&r, &m2);
      if (memcmp(m.piece, m2.piece, QF_SLOTS) != 0) return 952;
      if (memcmp(m.orient, m2.orient, QF_SLOTS) != 0) return 953;
    }
    /* an illegal map must be refused, not silently accepted */
    QfPMap bad; QfCube sv; qf_solved(&sv); qf_pmap(&sv, &bad);
    bad.piece[0] = 8;                       /* an edge in a corner slot */
    QfCube tmp;
    if (qf_cube_from_pmap(&bad, &tmp) == 0) return 954;
  }

  /* ---- layer 8: the last-layer book ---------------------------------- */
  {
    int n = qf_ll_count();
    if (n != QF_LL_N) return 1000;            /* 288*8*27 = 62208 elements */
    QfPMap m; QfCube sv; qf_solved(&sv); qf_pmap(&sv, &m);
    if (qf_ll_encode(&m) != 0) return 1001;   /* solved cube is element 0 */
    QfLlBook *bk = (QfLlBook *)malloc(sizeof(QfLlBook));
    if (!bk) return 1002;
    qf_ll_book_init(bk);
    /* A depth-7 sweep over all 18 outer moves needs no prune tables, costs
       about 300k nodes, and reaches words long enough to expose any mistake in
       how the book stores them. */
    int swept = qf_ll_sweep(bk, 7, QF_MASK_OUTER, 0, NULL, NULL, 0);
    if (swept != 7) { free(bk); return 1003; }
    if (bk->len[0] != 0) { free(bk); return 1004; }
    /* every recorded word must actually produce its element */
    int id, bad = 0, checked = 0, longest = 0;
    for (id = 0; id < QF_LL_N; id++) {
      if (bk->len[id] == 255) continue;
      int w[QF_LL_MAXLEN], q;
      for (q = 0; q < bk->len[id]; q++)
        w[q] = bk->word[(size_t)id * QF_LL_MAXLEN + q];
      if (bk->len[id] > longest) longest = bk->len[id];
      QfCube c; qf_solved(&c);
      qf_apply_seq(&c, w, bk->len[id]);        /* the word must produce the element */
      QfPMap mm; qf_pmap(&c, &mm);
      if (qf_ll_encode(&mm) != id) { bad = 1; break; }
      int alg[QF_LL_MAXLEN];
      int an = qf_ll_algorithm(bk, id, alg, QF_LL_MAXLEN);
      if (an < 0) { bad = 1; break; }
      qf_apply_seq(&c, alg, an);               /* and its inverse must solve it */
      if (!qf_is_solved(&c)) { bad = 1; break; }
      checked++;
    }
    int found = bk->nfound;
    free(bk);
    if (bad) return 1005;
    if (checked < 100) return 1006;           /* depth 7 over 18 moves finds 108 */
    if (longest < 6) return 1007;             /* must have exercised long words */
    (void)found;
  }

  return 0;
}

/* ================================================================== *
 * the last-layer book
 *
 * Every algorithm a last-layer method needs, derived from scratch and
 * provably shortest within the depth swept so far.
 *
 * The sweep is a depth-first enumeration of move words from the solved
 * cube.  Whenever a node has the first two layers home, the eight
 * last-layer pieces are necessarily in the last layer, so the node IS a
 * last-layer element; the word that reached it, inverted, is an algorithm
 * for that element.  Recording the shortest such word per element gives
 * the whole book.
 *
 * Two things make it feasible on a laptop:
 *   - an admissible prune from three exact tables (bottom cross, middle
 *     edges, bottom corners).  A branch whose first two layers are further
 *     from home than the moves remaining can never end with them home;
 *   - the same canonical move order IDA* uses here: words differing only
 *     by reordering commuting turns reach the same state, so keeping one
 *     representative loses no element.
 *
 * The sweep is resumable: `swept` records the deepest fully completed
 * length, so a run can be stopped and continued, and the book only ever
 * improves.  That is what makes continuous algorithm generation possible.
 * ================================================================== */
#define QF_LL_RAW    746496      /* 24*81*24*16, the unfiltered product */
#define QF_LL_MAGIC  "QFOXLLB1"

static int32_t g_ll_dense[QF_LL_RAW];
static int     g_ll_ready = 0;
static const int g_pow3[4] = {1, 3, 9, 27};

/* Lehmer rank of a permutation of {0..3} */
static int rank4(const int *p) {
  int r = 0, used = 0, i, j;
  for (i = 0; i < 4; i++) {
    int v = p[i];
    int below = 0;
    for (j = 0; j < i; j++) if (p[j] < v) below++;
    r = r * (4 - i) + (v - below);
    used |= 1 << v;
  }
  (void)used;
  return r;
}

static int parity4(int rank) {
  /* decode the rank, count inversions */
  int p[4], avail[4] = {0, 1, 2, 3}, r = rank, i, j, inv = 0;
  for (i = 0; i < 4; i++) {
    int f = 1, k;
    for (k = i + 1; k < 4; k++) f *= k;         /* (3-i)! */
    f = 1; for (k = 1; k <= 3 - i; k++) f *= k;
    int idx = r / f; r %= f;
    int cnt = 0, pick = -1;
    for (j = 0; j < 4; j++) {
      if (avail[j] < 0) continue;
      if (cnt++ == idx) { pick = avail[j]; avail[j] = -1; break; }
    }
    p[i] = pick;
  }
  for (i = 0; i < 4; i++) for (j = i + 1; j < 4; j++) if (p[i] > p[j]) inv++;
  return inv & 1;
}

/* raw last-layer descriptor -> dense id, or -1 if it is not a legal element */
static int ll_dense_of(int crank, int cori, int erank, int eori) {
  int raw = ((crank * 81 + cori) * 24 + erank) * 16 + eori;
  if (raw < 0 || raw >= QF_LL_RAW) return -1;
  return g_ll_dense[raw];
}

static void ll_map_build(void) {
  int crank, cori, erank, eori, id = 0;
  for (crank = 0; crank < 24; crank++)
    for (erank = 0; erank < 24; erank++) {
      if (parity4(crank) != parity4(erank)) continue;   /* one cube, one parity */
      for (cori = 0; cori < 81; cori++) {
        int t = 0, q, v = cori;
        for (q = 0; q < 4; q++) { t += v % 3; v /= 3; }
        if (t % 3) continue;                            /* total twist is zero */
        for (eori = 0; eori < 16; eori++) {
          int f = 0;
          for (q = 0; q < 4; q++) f += (eori >> q) & 1;
          if (f & 1) continue;                          /* total flip is even */
          g_ll_dense[((crank * 81 + cori) * 24 + erank) * 16 + eori] = id++;
        }
      }
    }
  for (crank = 0; crank < QF_LL_RAW; crank++)
    if (g_ll_dense[crank] >= id) g_ll_dense[crank] = -1;
  g_ll_ready = 1;
}

int qf_ll_count(void) {
  if (!g_ll_ready) { int i; for (i = 0; i < QF_LL_RAW; i++) g_ll_dense[i] = 0; ll_map_build(); }
  return QF_LL_N;
}

/* the element a piece map is in, or -1 if the first two layers are not home */
int qf_ll_encode(const QfPMap *m) {
  int cp[4], ep[4], co = 0, eo = 0, i;
  if (!g_ll_ready) qf_ll_count();
  for (i = 0; i < 4; i++) {
    int p = m->piece[i], o = m->orient[i];
    if (p < 0 || p > 3 || o < 0 || o > 2) return -1;
    cp[i] = p; co += o * g_pow3[i];
  }
  for (i = 0; i < 4; i++) {
    int p = m->piece[8 + i], o = m->orient[i + 8];
    if (p < 8 || p > 11 || (o & ~1)) return -1;
    ep[i] = p - 8; eo |= (o & 1) << i;
  }
  return ll_dense_of(rank4(cp), co, rank4(ep), eo);
}

int qf_ll_book_init(QfLlBook *b) {
  if (!g_ll_ready) qf_ll_count();
  memset(b, 0, sizeof(*b));
  memset(b->len, 255, sizeof(b->len));
  b->len[0] = 0;                 /* the identity needs no moves */
  b->nfound = 1;
  return 0;
}

#define QF_LL_PRUNE 8

typedef struct {
  /* prune indices carried down the tree: a coordinate transition is a table
     lookup, while rebuilding the piece map and re-ranking it costs an order of
     magnitude more.  The piece map is only needed at the rare node whose first
     two layers are actually home -- so no cube is carried through the tree, it
     is rebuilt from the move path only when an element is found. */
  uint64_t idx[QF_LL_MAXLEN + 1][QF_LL_PRUNE];
  int moves[QF_LL_MAXLEN];
  int movelist[QF_NMOVES], nmoves;
  const QfCoord *pc;
  const QfTable *pt;
  int npc;
  QfLlBook *b;
  long long budget;
  int hit_budget;
} LlCtx;

static void ll_dfs(LlCtx *x, int depth, int bound, int last) {
  int i, h = 0;
  if (x->budget > 0 && --x->budget <= 0) { x->hit_budget = 1; return; }
  x->b->nodes++;
  for (i = 0; i < x->npc; i++) {
    uint64_t idx = x->idx[depth][i];
    QfTable tb = x->pt[i];
    if (idx == QF_BAD_IDX) { h = 99; break; }
    if (tb < 0 || tb >= MAX_TABLES || !g_tab[tb].in_use) continue;
    if (idx >= g_tab[tb].size) { h = 99; break; }
    int d = g_tab[tb].d[idx];
    if (d == QF_UNKNOWN) { h = 99; break; }
    if (d > h) h = d;
  }
  if (h > 90) return;
  if (depth + h > bound) return;
  if (h == 0) {                  /* first two layers home: this is an element */
    /* rebuild the cube from the move path only here -- the rare goal node.
       Carrying a 54-facelet cube through every node would be pure waste when
       the prune below reads only the carried coord indices. */
    QfCube c; qf_solved(&c);
    for (int q = 0; q < depth; q++) qf_apply(&c, x->moves[q]);
    QfPMap pm;
    int id;
    qf_pmap(&c, &pm);
    id = qf_ll_encode(&pm);
    if (id >= 0 && depth < x->b->len[id]) {
      int q;
      if (x->b->len[id] == 255) x->b->nfound++;
      x->b->len[id] = (uint8_t)depth;
      /* one byte per move: ids are 0..53, so this is exact and 4x smaller than
         storing ints.  A memcpy here would copy BYTES OF AN INT ARRAY, which is
         silently wrong for every word longer than one move. */
      for (q = 0; q < depth; q++)
        x->b->word[(size_t)id * QF_LL_MAXLEN + q] = (uint8_t)x->moves[q];
    }
  }
  if (depth >= bound) return;
  for (i = 0; i < x->nmoves; i++) {
    int m = x->movelist[i];
    if (last >= 0) {
      int lf = last / 3, cf = m / 3;
      if (lf == cf) continue;
      if (g_axis[last] == g_axis[m] && lf > cf) continue;
    }
    for (int q = 0; q < x->npc; q++)
      x->idx[depth + 1][q] = qf_coord_apply_index(x->pc[q], x->idx[depth][q], m);
    x->moves[depth] = m;
    ll_dfs(x, depth + 1, bound, m);
    if (x->hit_budget) return;
  }
}

int qf_ll_sweep(QfLlBook *b, int max_len, uint64_t mask, long long budget,
                const QfCoord *pc, const QfTable *pt, int npc) {
  LlCtx x;
  int m, bound, i;
  if (!g_ll_ready) qf_ll_count();
  if (max_len > QF_LL_MAXLEN) max_len = QF_LL_MAXLEN;
  memset(&x, 0, sizeof(x));
  x.b = b; x.pc = pc; x.pt = pt; x.npc = npc; x.budget = budget;
  if (!(mask & ~QF_MASK_ROT)) return -1;
  for (m = 0; m < QF_NMOVES; m++) if ((mask >> m) & 1ULL) x.movelist[x.nmoves++] = m;
  if (npc > QF_LL_PRUNE) npc = QF_LL_PRUNE;
  QfCube sv; qf_solved(&sv);
  for (i = 0; i < npc; i++) x.idx[0][i] = qf_coord_index(pc[i], &sv);
  for (bound = b->swept + 1; bound <= max_len; bound++) {
    x.hit_budget = 0;
    ll_dfs(&x, 0, bound, -1);
    if (x.hit_budget) return b->swept;
    b->swept = bound;
  }
  return b->swept;
}

/* the algorithm for one element: the recorded word, inverted */
int qf_ll_algorithm(const QfLlBook *b, int id, int *out, int cap) {
  int i, n;
  if (id < 0 || id >= QF_LL_N) return -1;
  n = b->len[id];
  if (n == 255) return -1;
  if (n > cap) return -2;
  for (i = 0; i < n; i++) {
    int m = b->word[(size_t)id * QF_LL_MAXLEN + (n - 1 - i)];
    out[i] = (m / 3) * 3 + (2 - m % 3);
  }
  return qf_optimize(out, n);
}

/* ---- answering a stage out of the book -------------------------------- *
 * The ball of every element the sweep has reached, walked in ascending length
 * and applied to the position, IS an exhaustive last-layer search: no IDA*, no
 * heuristic, no node budget, and no goal-set machinery, because the conditions
 * are tested on the cube a word lands on.  A goal that is a set of 288 elements
 * ("last layer oriented, permutation free") therefore costs exactly as much as
 * one that is a single state, which is what makes the beginner last-layer
 * stages -- orient edges, then corners, then permute -- solvable optimally
 * rather than merely solvable.
 *
 * For a position whose first two layers are home the hit is provably optimal.
 * A word that ends with the first two layers home moves the position to another
 * element, the ball holds a shortest word for every element it knows, and the
 * elements form a quotient group, so the shortest word reaching a condition is
 * the shortest word for the element it lands on.  For a position with free
 * M-slice edges (Roux before LSE) the scan is optimal only among words that
 * also leave the first two layers home -- a restriction, and the reason the
 * caller keeps a search behind it.
 * ------------------------------------------------------------------------ */
int qf_ll_scan(const QfLlBook *b, const QfCube *start, const QfStage *st,
               QfSolution *out) {
  static int order[QF_LL_N];          /* the ball, sorted by book length */
  int cnt[QF_LL_MAXLEN + 2], head[QF_LL_MAXLEN + 2], pos[QF_LL_MAXLEN + 2];
  int i, len, q, ok, id, top;
  QfCube c;
  QfPMap pm, pm0;

  memset(out, 0, sizeof(*out));
  out->status = 1;
  if (!b || b->nfound <= 0 || st->nkeep <= 0) return 1;
  top = b->swept < QF_LL_MAXLEN ? b->swept : QF_LL_MAXLEN;

  memset(cnt, 0, sizeof(cnt));
  for (i = 0; i < QF_LL_N; i++)
    if (b->len[i] != 255 && b->len[i] <= top) cnt[b->len[i]]++;
  head[0] = 0;
  for (len = 0; len <= top; len++) head[len + 1] = head[len] + cnt[len];
  memcpy(pos, head, sizeof(pos));
  for (i = 0; i < QF_LL_N; i++) {
    int L = b->len[i];
    if (L != 255 && L <= top) order[pos[L]++] = i;
  }

  qf_pmap(start, &pm0);
  out->optimal = qf_ll_encode(&pm0) >= 0;      /* optimal only with F2L home */

  for (len = 0; len <= top; len++) {
    for (i = head[len]; i < head[len + 1]; i++) {
      const uint8_t *w;
      id = order[i];
      w = b->word + (size_t)id * QF_LL_MAXLEN;
      out->nodes++;
      ok = 1;
      for (q = 0; q < len; q++)
        if (!((st->mask >> w[q]) & 1ULL)) { ok = 0; break; }
      if (!ok) continue;
      c = *start;
      for (q = 0; q < len; q++) qf_apply(&c, w[q]);
      qf_pmap(&c, &pm);
      for (q = 0; q < st->nkeep; q++) {
        uint64_t idx = qf_coord_index_pm(st->keep[q], &pm);
        QfTable tb;
        if (idx == QF_BAD_IDX) { ok = 0; break; }
        tb = st->use_keep_table ? st->keep_table[q] : -1;
        if (tb >= 0 && tb < MAX_TABLES && g_tab[tb].in_use) {
          if (idx >= g_tab[tb].size || g_tab[tb].d[idx] != 0) { ok = 0; break; }
        } else if (idx != st->keep_target[q]) { ok = 0; break; }
      }
      if (!ok) continue;
      for (q = 0; q < len; q++) out->moves[q] = w[q];
      out->n = qf_optimize(out->moves, len);
      out->status = 0;
      return 0;
    }
  }
  return 1;
}

/* ---- the meet in the middle ------------------------------------------ *
 * The scan above only reaches as far as the sweep has gone.  An element
 * deeper than that is still solvable out of the same book, because the ball of
 * radius r around the identity multiplies onto the ball of radius 2r: write the
 * shortest word for X as two halves and each half is a ball element.  So for
 * every ball element g, X.g^-1 is some element h, and if h is in the ball too
 * then g^-1 followed by the word for h solves X -- and taking the minimum over
 * g gives exactly d(X), not an approximation, for every X with d(X) <= 2r.
 * A goal that is a SET is handled the same way: solving X into s is solving
 * X.s^-1 into the identity, and s^-1 is just the inverse of s's own word.
 * `goals` holds element ids that are themselves in the ball; the cheapest of
 * them wins.  Returns the length written to out, or -1 if no split was found.
 * Cost is one pass over the ball per goal, so a goal set of four (the AUF
 * images of solved) is a fraction of a second and a goal set of 288 is not --
 * callers with a big goal set should let the scan answer them first. */
int qf_ll_product(const QfLlBook *b, const QfCube *start, const int *goals,
                  int ngoal, int max_total, int *out, int cap) {
  static int order[QF_LL_N];
  int cnt[QF_LL_MAXLEN + 2], head[QF_LL_MAXLEN + 2], pos[QF_LL_MAXLEN + 2];
  int i, len, q, top, best, bn = 0;
  int mv[QF_SOL_MAX * 2];
  QfCube y, yi;

  if (!b || b->nfound <= 0 || ngoal <= 0) return -1;
  for (i = 0; i < ngoal; i++)
    if (goals[i] < 0 || goals[i] >= QF_LL_N || b->len[goals[i]] == 255) return -1;
  top = b->swept < QF_LL_MAXLEN ? b->swept : QF_LL_MAXLEN;
  if (max_total > 2 * top) max_total = 2 * top;

  memset(cnt, 0, sizeof(cnt));
  for (i = 0; i < QF_LL_N; i++)
    if (b->len[i] != 255 && b->len[i] <= top) cnt[b->len[i]]++;
  head[0] = 0;
  for (len = 0; len <= top; len++) head[len + 1] = head[len] + cnt[len];
  memcpy(pos, head, sizeof(pos));
  for (i = 0; i < QF_LL_N; i++) {
    int L = b->len[i];
    if (L != 255 && L <= top) order[pos[L]++] = i;
  }

  best = max_total + 1;
  for (len = 0; len <= top && len < best; len++) {
    for (i = head[len]; i < head[len + 1]; i++) {
      const uint8_t *wg = b->word + (size_t)order[i] * QF_LL_MAXLEN;
      int e, e2, k;
      QfPMap pm;
      y = *start;
      for (q = len - 1; q >= 0; q--) qf_apply(&y, (wg[q] / 3) * 3 + (2 - wg[q] % 3));
      qf_pmap(&y, &pm);
      e = qf_ll_encode(&pm);
      if (e < 0 || b->len[e] == 255) continue;
      /* the cube of e^-1: the identity with e's own word undone */
      qf_solved(&yi);
      {
        const uint8_t *we = b->word + (size_t)e * QF_LL_MAXLEN;
        for (q = b->len[e] - 1; q >= 0; q--)
          qf_apply(&yi, (we[q] / 3) * 3 + (2 - we[q] % 3));
      }
      for (k = 0; k < ngoal; k++) {
        const uint8_t *ws = b->word + (size_t)goals[k] * QF_LL_MAXLEN;
        QfCube z = yi;
        for (q = 0; q < b->len[goals[k]]; q++) qf_apply(&z, ws[q]);
        qf_pmap(&z, &pm);
        e2 = qf_ll_encode(&pm);
        if (e2 < 0 || b->len[e2] == 255) continue;
        if (len + b->len[e2] >= best) continue;
        best = len + b->len[e2];
        bn = 0;
        for (q = len - 1; q >= 0; q--) mv[bn++] = (wg[q] / 3) * 3 + (2 - wg[q] % 3);
        {
          const uint8_t *w2 = b->word + (size_t)e2 * QF_LL_MAXLEN;
          for (q = 0; q < b->len[e2]; q++) mv[bn++] = w2[q];
        }
      }
    }
  }
  if (bn == 0 || best > max_total) return -1;
  if (bn > cap) return -2;
  for (q = 0; q < bn; q++) out[q] = mv[q];
  return qf_optimize(out, bn);
}

int qf_ll_book_save(const QfLlBook *b, const char *path) {
  FILE *f = fopen(path, "wb");
  if (!f) return -1;
  fwrite(QF_LL_MAGIC, 1, 8, f);
  fwrite(&b->swept, sizeof(int), 1, f);
  fwrite(&b->nfound, sizeof(int), 1, f);
  fwrite(b->len, 1, QF_LL_N, f);
  fwrite(b->word, 1, (size_t)QF_LL_N * QF_LL_MAXLEN, f);
  fclose(f);
  return 0;
}

int qf_ll_book_load(QfLlBook *b, const char *path) {
  char magic[8];
  FILE *f = fopen(path, "rb");
  if (!f) return -1;
  if (fread(magic, 1, 8, f) != 8 || memcmp(magic, QF_LL_MAGIC, 8) != 0) { fclose(f); return -3; }
  memset(b, 0, sizeof(*b));
  if (fread(&b->swept, sizeof(int), 1, f) != 1) { fclose(f); return -3; }
  if (fread(&b->nfound, sizeof(int), 1, f) != 1) { fclose(f); return -3; }
  if (fread(b->len, 1, QF_LL_N, f) != QF_LL_N) { fclose(f); return -3; }
  if (fread(b->word, 1, (size_t)QF_LL_N * QF_LL_MAXLEN, f) != (size_t)QF_LL_N * QF_LL_MAXLEN) { fclose(f); return -3; }
  fclose(f);
  if (!g_ll_ready) qf_ll_count();
  return 0;
}


#ifdef QFOX_STANDALONE
static int tokenise(char *buf, int *moves, int cap) {
  int n = 0;
  char *tok = strtok(buf, " \t\n");
  while (tok && n < cap) {
    int m = qf_parse_move(tok);
    if (m < 0) { fprintf(stderr, "bad move token: %s\n", tok); return -1; }
    moves[n++] = m;
    tok = strtok(NULL, " \t\n");
  }
  return n;
}

static void print_seq(const int *moves, int n) {
  int i; char b[4];
  for (i = 0; i < n; i++) { qf_move_name(moves[i], b, 4); printf("%s ", b); }
  printf("\n");
}

int main(int argc, char **argv) {
  int r = qf_init();
  printf("%s  self-test=%d\n", qf_version(), r);
  if (r != 0) return r;
  if (argc > 1) {
    static char buf[8192];
    int i, len = 0;
    for (i = 1; i < argc; i++) {
      int l = (int)strlen(argv[i]);
      if (len + l + 2 > (int)sizeof(buf)) break;
      memcpy(buf + len, argv[i], (size_t)l); len += l; buf[len++] = ' ';
    }
    buf[len] = 0;
    int scr[512];
    int n = tokenise(buf, scr, 512);
    if (n < 0) return 1;
    QfCube c; qf_solved(&c);
    qf_apply_seq(&c, scr, n);
    printf("scramble: %d tokens, already solved=%d\n", n, qf_is_solved(&c));
    clock_t t0 = clock();
    if (qf_fullsolver_prepare(1ULL << 24) != 0) { printf("prepare failed\n"); return 1; }
    double tprep = (double)(clock() - t0) / CLOCKS_PER_SEC;
    t0 = clock();
    int sol[QF_SOL_MAX], p1 = 0, p2 = 0;
    int ns = qf_solve_full_phases(&c, sol, QF_SOL_MAX, &p1, &p2);
    double tsolve = (double)(clock() - t0) / CLOCKS_PER_SEC;
    printf("tables %.2fs  search %.3fs\n", tprep, tsolve);
    if (ns < 0) { printf("solve failed\n"); return 1; }
    printf("phase1=%d phase2=%d raw=%d\n", p1, p2, ns);
    ns = qf_optimize(sol, ns);
    printf("reduced=%d: ", ns);
    print_seq(sol, ns);
    QfCube v = c;
    qf_apply_seq(&v, sol, ns);
    printf("verified solved: %d  htm=%d qtm=%d stm=%d etm=%d\n", qf_is_solved(&v),
           qf_seq_cost(QF_HTM, sol, ns), qf_seq_cost(QF_QTM, sol, ns),
           qf_seq_cost(QF_STM, sol, ns), qf_seq_cost(QF_ETM, sol, ns));
  }
  return 0;
}
#endif
