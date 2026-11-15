/*
 * Q-FOX engine — public C API.
 *
 * Design notes
 * ------------
 * Two levels, one derived from the other:
 *
 *  1. Facelet level (54 stickers). Every move is a rotation matrix applied to
 *     the layer of stickers whose 3D position/normal came from the unfolded
 *     net convention. Nothing is transcribed from somebody else's table, so
 *     it cannot disagree with the geometry. qf_check_consistency() re-verifies
 *     the whole chain at runtime.
 *
 *  2. Slot/piece level (8 corner slots + 12 edge slots), bootstrapped from
 *     level 1: for every move we record which slot a cubie travels to and how
 *     its orientation shifts, by applying the move to the solved cube and
 *     reading the colours back. Coordinate transitions then cost O(tracked
 *     slots) instead of O(54), which is what lets multi-million-state pattern
 *     databases be BFS'd in seconds.
 *
 * Coordinate model
 * ----------------
 * A Coord is a product of up to QF_MAX_PARTS independent parts:
 *
 *   EDGE_PERM     "which slot holds piece P?" for a chosen piece set,
 *                 optionally confined to a chosen slot set, optionally
 *                 unordered (set membership). Piece-centric => closed under
 *                 ANY move set, because we follow the piece around.
 *   CORNER_PERM   same for corners.
 *   EDGE_ORIENT   "orientation of whatever cubie sits in slot S". Slot-centric
 *                 => closed under any move set, because a move's orientation
 *                 delta depends only on (move, src slot, dst slot) geometry,
 *                 never on which cubie is carried.
 *   CORNER_ORIENT same for corners.
 *
 * Closure is what makes a BFS distance table over a Coord EXACT, so the table
 * is an admissible heuristic and a stage goal is simply "these Coords must
 * equal these target indices". The same mechanism serves cross, F2L pairs,
 * blocks, EOLine, OLL, PLL, CMLL, LSE, Kociemba's phase-2 prune tables, and
 * every stage the search invents later -- no per-method special casing.
 */
#ifndef QFOX_H
#define QFOX_H

#include <stdint.h>
#include <stddef.h>

#ifdef __cplusplus
extern "C" {
#endif

#define QF_FACELETS   54
#define QF_SLOTS      20      /* 0..7 corners, 8..19 edges */
#define QF_CORNERS     8
#define QF_EDGES      12
#define QF_NMOVES     54
#define QF_MAX_CONST  16
#define QF_MAX_PARTS   6
#define QF_SOL_MAX    40

/* move ids: family*3 + power, power 0 = cw, 1 = 180, 2 = ccw */
enum {
  QF_U = 0, QF_U2, QF_Ui, QF_R = 3, QF_R2, QF_Ri, QF_F = 6, QF_F2, QF_Fi,
  QF_D = 9, QF_D2, QF_Di, QF_L = 12, QF_L2, QF_Li, QF_B = 15, QF_B2, QF_Bi,
  QF_M = 18, QF_M2, QF_Mi, QF_E = 21, QF_E2, QF_Ei, QF_S = 24, QF_S2, QF_Si,
  QF_Rw = 27, QF_Rw2, QF_Rwi, QF_Lw = 30, QF_Lw2, QF_Lwi,
  QF_Uw = 33, QF_Uw2, QF_Uwi, QF_Dw = 36, QF_Dw2, QF_Dwi,
  QF_Fw = 39, QF_Fw2, QF_Fwi, QF_Bw = 42, QF_Bw2, QF_Bwi,
  QF_x = 45, QF_x2, QF_xi, QF_y = 48, QF_y2, QF_yi, QF_z = 51, QF_z2, QF_zi
};

#define QF_MASK_OUTER  0x000000000003FFFFULL  /* 0..17  U R F D L B   */
#define QF_MASK_SLICE  0x0000000007FC0000ULL  /* 18..26 M E S         */
#define QF_MASK_WIDE   0x00001FFFF8000000ULL  /* 27..44 r l u d f b   */
#define QF_MASK_ROT    0x003FE00000000000ULL  /* 45..53 x y z         */
#define QF_MASK_ALL    0x003FFFFFFFFFFFFFULL

#define QF_MK_U (0x7ULL)
#define QF_MK_R (0x7ULL << 3)
#define QF_MK_F (0x7ULL << 6)
#define QF_MK_D (0x7ULL << 9)
#define QF_MK_L (0x7ULL << 12)
#define QF_MK_B (0x7ULL << 15)
#define QF_MK_M (0x7ULL << 18)
#define QF_MK_E (0x7ULL << 21)
#define QF_MK_S (0x7ULL << 24)
#define QF_MK_Rw (0x7ULL << 27)
#define QF_MK_Lw (0x7ULL << 30)
#define QF_MK_Uw (0x7ULL << 33)
#define QF_MK_Dw (0x7ULL << 36)
#define QF_MK_Fw (0x7ULL << 39)
#define QF_MK_Bw (0x7ULL << 42)
#define QF_MK_x  (0x7ULL << 45)
#define QF_MK_y  (0x7ULL << 48)
#define QF_MK_z  (0x7ULL << 51)

enum { QF_HTM = 0, QF_QTM = 1, QF_STM = 2, QF_ETM = 3, QF_NMETRICS = 4 };

enum {
  /* Piece-centric placement. Closed under any move set because we follow the
   * piece: given (slot, orientation) and a move, the next (slot, orientation)
   * is determined without knowing anything about the other cubies. */
  QF_PART_EDGE_PERM = 0,
  QF_PART_CORNER_PERM = 1,
  QF_PART_EDGE_PERM_ORIENT = 2,     /* slot + flip, per tracked edge piece    */
  QF_PART_CORNER_PERM_ORIENT = 3,   /* slot + twist, per tracked corner piece */
  /* Slot-centric orientation. Only closed when every slot of that cubie type
   * is tracked, which qf_coord_new() enforces. This is EO / CO / OLL. */
  QF_PART_EDGE_ORIENT = 4,
  QF_PART_CORNER_ORIENT = 5
};

typedef struct { uint8_t f[QF_FACELETS]; } QfCube;

typedef struct {
  int32_t kind;             /* QF_PART_* */
  int32_t items[QF_EDGES];  /* piece ids (perm) or slot ids (orient) */
  int32_t n;
  int32_t allowed[QF_EDGES];/* perm only: slots the pieces are confined to */
  int32_t na;
  int32_t unordered;        /* perm only: set membership, not ordered placement */
} QfPart;

typedef struct { QfPart part[QF_MAX_PARTS]; int32_t npart; } QfCoordSpec;

typedef int32_t QfCoord;   /* >= 0 ok */
typedef int32_t QfTable;   /* >= 0 ok */

/* Piece map: the cubie view of a cube state, computed once per state so that
 * every Coord of that state is read from the same cheap arrays. */
typedef struct {
  int8_t piece[QF_SLOTS];   /* piece id sitting in slot s (piece id == home slot) */
  int8_t orient[QF_SLOTS];  /* its orientation in that slot */
  int8_t slotof[QF_SLOTS];  /* inverse of piece[] */
} QfPMap;

/* ---- lifecycle --------------------------------------------------------- */
int  qf_init(void);                     /* idempotent, 0 == ok */
const char *qf_version(void);
int  qf_check_consistency(int trials);  /* 0 == ok, else the failing test id */
/* Struct widths a binding has to mirror exactly.  A ctypes Structure that
 * disagrees with this header does not fail loudly -- it overflows the heap and
 * takes the interpreter with it -- so the binding asks first and refuses to run
 * on a library built from a different header.  0 QF_SOL_MAX, 1 QF_MAX_COLLECT,
 * 2 QF_MAX_CONST, 3 QF_LL_N, 4 QF_LL_MAXLEN, 5 QF_NMOVES, 6 QF_SLOTS,
 * 7 QF_FACELETS, 8 QF_MAX_PARTS, 9 QF_MAX_COORDS-ish table slots. */
int  qf_abi(int which);

/* ---- cube basics ------------------------------------------------------- */
void qf_solved(QfCube *c);
void qf_apply(QfCube *c, int move);
void qf_apply_seq(QfCube *c, const int *moves, int n);
int  qf_is_solved(const QfCube *c);
int  qf_parse_move(const char *tok);
int  qf_move_name(int move, char *out, size_t n);
int  qf_move_cost(int metric, int move);
int  qf_seq_cost(int metric, const int *moves, int n);
int  qf_slot_id(const char *name);      /* "URF", "DF", ... -> slot id */
int  qf_slot_name(int slot, char *out, size_t n);
/* Merge same-family turns to a fixed point and rewrite `moves` in place.
 * Any length is accepted (whole solves run well past QF_SOL_MAX); returns the
 * new length, -1 on a bad move id, -2 if scratch could not be allocated. */
int  qf_optimize(int *moves, int n);
void qf_pmap(const QfCube *c, QfPMap *m);

/* ---- coordinates & tables --------------------------------------------- */
QfCoord  qf_coord_new(const QfCoordSpec *spec);
int      qf_coord_size(QfCoord co, uint64_t *out);
uint64_t qf_coord_index(QfCoord co, const QfCube *c);
uint64_t qf_coord_index_pm(QfCoord co, const QfPMap *m);
/* Transition an index directly, without a cube. Used to vectorise symmetry
 * orbits over a whole case space. UINT64_MAX means the move leaves the region. */
uint64_t qf_coord_apply_index(QfCoord co, uint64_t idx, int move);
void     qf_coord_apply_index_batch(QfCoord co, const uint64_t *in, uint64_t *out,
                                    uint64_t n, int move);

QfTable  qf_table_build(QfCoord co, uint64_t from_index, uint64_t mask, uint64_t max_size);
/* Multi-source BFS: distance to the nearest seed. This is how a goal that is a
 * SET rather than a single state gets an exact distance table -- e.g. "last
 * layer oriented, permutation free" is 576 seeds inside the LL coordinate. */
QfTable  qf_table_build_multi(QfCoord co, const uint64_t *seeds, int nseeds,
                              uint64_t mask, uint64_t max_size);
/* Same, but also records for every state the move and parent that discovered
 * it. The seed->state path IS an optimal algorithm for that state, which is
 * how the algorithm generator produces provably optimal algs instead of
 * transcribing them from a website. */
QfTable  qf_table_build_traced(QfCoord co, const uint64_t *seeds, int nseeds,
                               uint64_t mask, uint64_t max_size);
int      qf_table_is_traced(QfTable t);
/* Moves taking a seed to `idx`; returns count, or -1 if unreachable. */
int      qf_table_path(QfTable t, uint64_t idx, int *out, int cap);
QfTable  qf_table_build_solved(QfCoord co, uint64_t mask, uint64_t max_size);
int      qf_table_lookup(QfTable t, uint64_t idx);      /* 255 == unreachable */
uint64_t qf_table_size(QfTable t);
uint64_t qf_table_reachable(QfTable t);
void     qf_table_hist(QfTable t, uint64_t *hist, int hist_n);
void     qf_table_free(QfTable t);
const uint8_t *qf_table_data(QfTable t);   /* raw distance array, size bytes */
int      qf_table_save(QfTable t, const char *path);
QfTable  qf_table_load(QfCoord co, const char *path);

/* ---- stage solving ---------------------------------------------------- */
typedef struct {
  QfCoord  keep[QF_MAX_CONST];        /* hard goal conditions */
  uint64_t keep_target[QF_MAX_CONST];
  QfTable  keep_table[QF_MAX_CONST];  /* used only when use_keep_table is set:
                                       * condition becomes table[idx] == 0, so a
                                       * goal may be a SET of states */
  int      use_keep_table;
  int      nkeep;
  QfCoord  heur[QF_MAX_CONST];        /* admissible heuristics */
  QfTable  heur_table[QF_MAX_CONST];
  int      nheur;
  uint64_t mask;
  int      max_depth;
  long long node_budget;              /* total across the deepening ladder */
  int      allow_rotations;
} QfStage;

typedef struct {
  int       moves[QF_SOL_MAX];
  int       n;
  int       optimal;
  long long nodes;
  int       status;                   /* 0 solved, 1 budget exhausted, 2 none */
} QfSolution;

int qf_solve_stage(const QfCube *start, const QfStage *st, QfSolution *out);

/* Enumerate every canonical solution of length <= max_len, up to `limit` of
 * them. Used by the two-phase solver (try many phase-1 endings, keep the best
 * total) and by the algorithm generator (list all optimal algs for a case). */
#define QF_MAX_COLLECT 4096
typedef struct {
  int moves[QF_MAX_COLLECT][QF_SOL_MAX];
  int len[QF_MAX_COLLECT];
  int n;
  int truncated;
} QfSolutionSet;
int qf_enumerate_stage(const QfCube *start, const QfStage *st, int max_len,
                       int limit, QfSolutionSet *out);

/* ---- whole-cube reference solver (two phase, Kociemba style) ---------- */
int  qf_fullsolver_prepare(uint64_t max_table_size);  /* 0 == ok */
int  qf_solve_full(const QfCube *c, int *moves, int cap);  /* length, or -1 */
int  qf_solve_full_phases(const QfCube *c, int *moves, int cap, int *p1, int *p2);

#ifdef __cplusplus
}
#endif
#endif /* QFOX_H */

/* ---- the last-layer book -------------------------------------------- *
 * Every last-layer algorithm, derived by exhaustive sweep and provably
 * shortest within the depth swept so far.  See the section of the same
 * name in qfox.c for why this is cheap enough to run on a laptop.
 * --------------------------------------------------------------------- */
#define QF_LL_MAXLEN 16
#define QF_LL_N      62208        /* 288 permutations * 8 flips * 27 twists */

typedef struct {
  int       swept;               /* deepest length fully enumerated */
  int       nfound;              /* elements that have a word */
  long long nodes;               /* total across every sweep */
  uint8_t   len[QF_LL_N];        /* 255 = not reached yet */
  uint8_t   word[QF_LL_N * QF_LL_MAXLEN];
} QfLlBook;

int  qf_ll_count(void);          /* builds the dense element map, returns 62208 */
int  qf_ll_encode(const QfPMap *m);   /* element id, or -1 if F2L is not home */
int  qf_ll_book_init(QfLlBook *b);
/* Sweep words of length b->swept+1 .. max_len from solved.  pc/pt are exact
 * first-two-layer tables used as an admissible prune (may be NULL/0).  A
 * positive budget stops the sweep early; b->swept then stays where it was, so
 * the next call resumes instead of restarting. */
int  qf_ll_sweep(QfLlBook *b, int max_len, uint64_t mask, long long budget,
                 const QfCoord *pc, const QfTable *pt, int npc);
int  qf_ll_algorithm(const QfLlBook *b, int id, int *out, int cap);
/* Answer a stage out of the book instead of searching it: walk every element
 * the sweep has reached in ascending book length, apply its word to `start`,
 * and take the first one that satisfies all of st->keep.  Only moves inside
 * st->mask count.  Returns 0 on a hit (out->optimal says whether that hit is
 * provably shortest), 1 when no element of the ball works. */
int  qf_ll_scan(const QfLlBook *b, const QfCube *start, const QfStage *st,
                QfSolution *out);
/* Meet in the middle for an element deeper than the sweep: the shortest
 * g^-1 . h with both halves in the ball that lands `start` on one of `goals`.
 * Exact for every element within twice the swept depth.  Returns the length
 * written to out, -1 if nothing split, -2 if out is too small. */
int  qf_ll_product(const QfLlBook *b, const QfCube *start, const int *goals,
                   int ngoal, int max_total, int *out, int cap);
int  qf_ll_book_save(const QfLlBook *b, const char *path);
int  qf_ll_book_load(QfLlBook *b, const char *path);

