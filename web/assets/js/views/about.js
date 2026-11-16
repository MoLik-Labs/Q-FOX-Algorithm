/** Giới thiệu: hệ thống là gì, cách tái tạo mọi con số, và ai làm ra nó. */
import { data, totals } from "../data.js";
import { el, mount, chip, int, num } from "../util.js";

const REPO = "https://github.com/MoLik-Labs/Q-FOX-Algorithm";
const TAG = "https://instagram.com/its.fox_";

export function render() {
  const t = totals();
  const view = el("div");

  const map = [
    ["engine/qfox.c, engine/qfox.h", "Khối rubik. Dán, 54 động tác, các mã hóa tọa độ, xây bảng BFS, IDA*, quét sách lớp cuối, và một tự kiểm thử dài 1000 dòng chạy trên mỗi lần build."],
    ["engine/build.sh", "Tái build build/libqfox.so và build/qfox. Hãy đọc output: một build thất bại sẽ giữ nguyên binary cũ."],
    ["qfox/native.py", "Binder ctypes. Mọi độ rộng struct đều được kiểm tra với qf_abi() tại import, nên một build không khớp sẽ báo lỗi rõ ràng thay vì làm hỏng heap."],
    ["qfox/coords.py", "Danh mục tọa độ: EO, CO, hoán vị góc và cạnh, cross, các khối, Roux LSE, ZZ EOLine, bảng tọa độ Kociemba, và các tọa độ lớp cuối."],
    ["qfox/methods/", "base.py (Goal, Stage, Method, SolveTrace) cộng classic.py (CFOP, Roux, ZZ, Petrus, LBL) và qfox.py (bốn tầng và các biến thể khai màn)."],
    ["qfox/alggen/", "cases.py suy ra các họ bài từ đối xứng; book.py kết nối một bài với sách lớp cuối của engine; llsolve.py gặp giữa cho những gì vượt quá độ quét."],
    ["qfox/benchmark/, scripts/bench.py", "Các cú trộn theo luật WCA, một bộ nhớ bảng dùng chung, kiểm chứng chạy lại mọi câu trả lời, thống kê theo bước."],
    ["scripts/gen_ll_book.py", "Quá trình quét có thể tiếp tục đã tạo ra data/llbook.bin."],
    ["scripts/gen_web_data.py", "Hỏi engine về mọi bài, giữ từ ngắn nhất đã kiểm chứng, ghi web/data/*.json — đầu vào duy nhất của trang này."],
    ["scripts/validate_web_data.py", "Chạy lại toàn bộ " + int(t.cases) + " thuật toán đối chiếu với mục tiêu và suy lại hình học khối của trang này từ các hoán vị của engine."],
    ["web/", "Trang này. File tĩnh, không build, không phụ thuộc, có thể deploy nguyên trạng lên Cloudflare Pages."],
  ];

  const commands = [
    ["bash engine/build.sh", "biên dịch engine và chạy tự kiểm thử"],
    ["./build/qfox \"R U R' U' D F2 B' L U2\"", "giải một cú trộn từ dòng lệnh"],
    ["python3 scripts/gen_ll_book.py --depth 13", "quét sách lớp cuối (có thể tiếp tục)"],
    ["python3 scripts/bench.py --all --scrambles 20 --stages --traces", "benchmark mọi phương pháp"],
    ["python3 scripts/gen_web_data.py", "tái sinh web/data/*.json"],
    ["python3 scripts/validate_web_data.py", "chứng minh bản xuất khớp với engine"],
    ["node web/test/model.test.mjs", "chứng minh khối trình duyệt khớp với bản xuất"],
  ];

  const guarantees = [
    [`${int(t.cases)} thuật toán, được chạy lại`, "Mỗi thẻ bài đều được tạo bằng cách áp dụng chính thuật toán của nó lên chính trạng thái của nó và kiểm tra mục tiêu của họ bằng các bảng tọa độ của engine — không bằng cách tin vào chỉ số của sách."],
    ["Ngắn nhất mà engine có thể chứng minh", "Các câu trả lời đến từ một lần quét hoàn chỉnh nhóm lớp cuối tới độ " + t.swept + ", nên bất kỳ thứ nào nó tới được đều tối ưu; còn những vị trí vượt quá, hai nửa của quả cầu được ghép lại, vẫn chính xác tới " + t.exactTo + " động tác."],
    ["Trung tâm không bị bỏ qua", "Một cú slice có thể đạt mục tiêu của bước và vẫn để hai trung tâm đổi chỗ. Mọi phương pháp đều kiểm tra lại sự xếp trung tâm, đó là lý do Roux giải được 20/20 ở đây chứ không phải 0/20."],
    ["Đối xứng được suy ra, không được giả định", "Các họ bài được tạo bằng cách áp dụng nhóm đối xứng và đếm quỹ đạo: 216 trạng thái OLL → 58, 288 PLL → 22, 648 CMLL → 43, 96 ELL → 30 — những con số đã xuất bản."],
    ["Trình duyệt không thể trôi dạt", "web/test/model.test.mjs và kiểm tra trong trang đều tái tạo toàn bộ 54 hoán vị từ hình học vẽ và đối chiếu với engine."],
  ];

  mount(view,
    el("div", { class: "section-head" },
      el("div", {},
        el("h1", {}, "Giới thiệu Q-FOX"),
        el("p", { class: "panel__note" },
          "Một công cụ giải rubik và tạo thuật toán tự chứa: engine C riêng, danh mục tọa độ riêng, sách lớp cuối riêng, và một trang chỉ xuất bản những gì engine chứng minh được.")),
      el("span", { class: "spacer" }),
      el("div", { class: "row row--tight" },
        el("a", { class: "btn btn--sm btn--primary", href: TAG, target: "_blank", rel: "noopener noreferrer me" }, "@its.fox_"),
        el("a", { class: "btn btn--sm", href: REPO, target: "_blank", rel: "noopener noreferrer" }, "Repository ↗"))),

    el("div", { class: "grid grid--2" },
      el("div", { class: "panel" },
        el("h3", {}, "Nó đảm bảo gì"),
        el("div", { class: "stack" }, guarantees.map(([title, body]) =>
          el("div", {}, el("b", {}, title), el("p", { class: "small muted", style: { margin: "2px 0 0" } }, body))))),
      el("div", { class: "panel" },
        el("h3", {}, "Các con số"),
        el("div", { class: "stats" },
          stat(int(t.elements), "phần tử lớp cuối"),
          stat(`${num(t.coverage, 2)}%`, "đã quét chính xác"),
          stat(int(t.cases), "bài xuất bản"),
          stat(String(t.methods), "phương pháp"),
          stat(String(t.levels), "cấp độ"),
          stat(String(t.moves), "động tác"),
          stat(`${t.methodsSolvedAll}/${t.methods}`, "phương pháp giải xong mọi cú trộn"),
          stat(String(data.book.reachable_by), "câu trả lời chính xác tới")))),

    el("div", { class: "section-head" }, el("h2", {}, "Tái tạo mọi thứ")),
    el("div", { class: "panel" },
      el("p", { class: "small muted" },
        "Từ một bản checkout sạch. Engine cần một trình biên dịch C; trang thì không cần gì cả — JSON đã được commit."),
      el("div", { class: "table-wrap" },
        el("table", { class: "table" },
          el("tbody", {}, commands.map(([cmd, why]) => el("tr", {},
            el("td", {}, el("code", { class: "tiny" }, cmd)),
            el("td", { class: "small muted" }, why))))))),

    el("div", { class: "section-head" }, el("h2", {}, "Các thứ nằm ở đâu")),
    el("div", { class: "panel" },
      el("div", { class: "table-wrap" },
        el("table", { class: "table" },
          el("tbody", {}, map.map(([path, why]) => el("tr", {},
            el("td", { class: "name" }, el("code", { class: "tiny" }, path)),
            el("td", { class: "small muted", style: { whiteSpace: "normal", minWidth: "320px" } }, why))))))),

    el("div", { class: "section-head" }, el("h2", {}, "Deploy trang này")),
    el("div", { class: "grid grid--2" },
      el("div", { class: "panel" },
        el("h3", {}, "Cloudflare Pages"),
        el("ol", { class: "small" },
          el("li", {}, "Push repository này lên GitHub."),
          el("li", {}, "Cloudflare dashboard → Workers & Pages → Create → Pages → Connect to Git."),
          el("li", {}, "Build command: ", el("b", {}, "để trống"), ". Output directory: ", el("code", {}, "web"), "."),
          el("li", {}, "Deploy. Sáu file JSON trong ", el("code", {}, "web/data"), " đã được commit, nên không có gì cần build."),
          el("li", {}, "Để làm mới các con số sau này: chạy ", el("code", {}, "scripts/gen_web_data.py"), " cục bộ, commit, và Pages sẽ deploy lại.")),
        el("p", { class: "tiny muted" },
          "web/_headers đặt cache cho các file dữ liệu; web/manifest.webmanifest giúp trang cài được.")),
      el("div", { class: "panel" },
        el("h3", {}, "Bất kỳ nơi nào khác"),
        el("p", { class: "small" }, "Nó là một thư mục file tĩnh. Bất kỳ cách nào sau đều dùng được:"),
        el("pre", { class: "code" },
`cd web && python3 -m http.server 8080
npx serve web
wrangler pages deploy web`),
        el("p", { class: "tiny muted" },
          "Mở index.html thẳng từ ổ đĩa sẽ không được: trình duyệt chặn fetch() các JSON cục bộ. Hãy phục vụ thư mục qua HTTP.")),

    el("div", { class: "panel", style: { marginTop: "20px" } },
      el("h3", {}, "Công trạng"),
      el("p", {},
        "Làm bởi ", el("a", { href: TAG, target: "_blank", rel: "noopener noreferrer me" }, el("b", {}, "@its.fox_")),
        " · source tại ", el("a", { href: REPO, target: "_blank", rel: "noopener noreferrer" }, "github.com/MoLik-Labs/Q-FOX-Algorithm"), "."),
      el("p", { class: "small muted" },
        "Tên động tác và tên bài (Sune, T-perm, Ja-perm…) theo ký hiệu speedcubing chuẩn. ",
        "Thuật toán được engine tạo độc lập; ở nơi có một thuật toán trong sách và nó được kiểm chứng đạt cùng mục tiêu, thẻ được dán tên quen thuộc của nó, và từ nào ngắn hơn thì được hiển thị."),
      el("div", { class: "row row--tight", style: { marginTop: "10px" } },
        chip("không có thư viện ngoài", "mint"),
        chip("không theo dõi", "mint"),
        chip("hoạt động offline sau khi tải", "sky"),
        chip(`${data.engine.engine}`, "fox")))));

  return { node: view };
}

function stat(v, k) {
  return el("div", { class: "stat" },
    el("div", { class: "stat__k" }, k),
    el("div", { class: "stat__v" }, v));
}
