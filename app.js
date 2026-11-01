
const KEY = "ssg-study-hub-v1";

const blank = () => ({
    SSG104: [],
    SSG105: [],
    progress: {
        SSG104: {},
        SSG105: {}
    }
});

let db;

try {
    db = {
        ...blank(),
        ...JSON.parse(localStorage.getItem(KEY) || "{}")
    };

    db.progress = {
        ...blank().progress,
        ...(db.progress || {})
    };
} catch {
    db = blank();
}

let course = "SSG104";
let importCourse = "SSG104";
let preview = [];
let items = [];
let at = 0;
let mode = "";
let chosen = [];
let done = false;

const $ = id => document.getElementById(id);

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
}[c]));

function save() {
    localStorage.setItem(KEY, JSON.stringify(db));
}

function toast(s) {
    $("toast").textContent = s;
    $("toast").classList.add("show");

    setTimeout(() => {
        $("toast").classList.remove("show");
    }, 2200);
}

function render() {
    let qs = db[course];
    let p = db.progress[course];

    let studied = Object.values(p).filter(x => x.attempts).length;
    let wrong = Object.values(p).filter(x => x.wrong).length;
    let pc = qs.length ? Math.round(studied / qs.length * 100) : 0;

    $("course-title").textContent = course;
    $("total").textContent = qs.length;
    $("studied").textContent = studied;
    $("wrong").textContent = wrong;
    $("percent").textContent = pc + "%";
    $("bar").style.width = pc + "%";

    $("progress-caption").textContent = qs.length
        ? studied + " / " + qs.length + " câu đã luyện"
        : "Bắt đầu học để ghi nhận tiến độ";

    $("count104").textContent = db.SSG104.length;
    $("count105").textContent = db.SSG105.length;

    $("n104").textContent = db.SSG104.length + " câu";
    $("n105").textContent = db.SSG105.length + " câu";

    $("bank-course").textContent = course;

    $("empty").classList.toggle("hidden", !!qs.length);

    $("bank-list").innerHTML = qs.map((q, i) => `
        <div class="bank-row">
            <div>
                <b>Câu ${i + 1}. ${esc(q.question.slice(0, 120))}</b>
                <small>
                    ${q.options.length} lựa chọn · Đáp án: ${esc(q.answer)}
                </small>
            </div>
            <button data-del="${i}">×</button>
        </div>
    `).join("");

    $("bank-list").classList.toggle("hidden", !qs.length);
}


// =========================
// PARSE CÂU HỎI
// =========================

function parse(raw) {
    const lines = raw.replace(/\r/g, "")
        .split("\n")
        .map(line => line.replace(/\\+\s*$/, ""));

    const result = [];

    let q = [];
    let opts = [];
    let answer = "";
    let notes = [];
    let image = "";
    let active = -1;
    let last = null;

    let skipImageBlock = false;
    let imageStarted = false;

    const clean = x => x.replace(
        /^(?:(?:question|q)\s*)?\d{1,4}\s*[.)、:-]\s*/i,
        ""
    ).trim();

    const norm = x => String(x || "")
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, " ")
        .trim();

    // Nhận diện lựa chọn A-F.
    // Hỗ trợ A., A), A:, A,, A-, A Label và a.People.
    const optionPattern =
        /^([A-F])(?:\s*[.)、:，,;–—-]\s*|\s+)(\S.*)$/i;

    // Nhận diện đáp án có chữ Answer.
    // Hỗ trợ Answer: A, Answer: AB, Answer: ACD...
    const answerPattern =
        /^(?:correct\s*)?answer\s*[:：-]\s*([A-F](?:[\s,;/&]*[A-F]){0,5})[.。]?\s*(?:\((.*)\))?$/i;

    // Nhận diện đáp án ngắn:
    // A, A., AB, A B, ACD, BCDE...
    const shortAnswerPattern =
        /^([A-F](?:[\s,;/&]+[A-F]){0,5}|[A-F]{1,6})[.。]?\s*(?:\((.*)\))?$/i;


    function finish() {
        if (!q.length && !opts.length) return;

        const question = q.join(" ")
            .replace(/\s+/g, " ")
            .trim();

        const keys = opts.map(x => x.key);

        const valid =
            !!question &&
            opts.length >= 2 &&
            !!answer &&
            [...answer].every(k => keys.includes(k));

        const item = {
            question,
            options: opts.map(x => ({ ...x })),
            answer,
            notes: notes.join(" "),
            image,
            valid,
            issue: !question
                ? "Thiếu câu hỏi"
                : opts.length < 2
                    ? "Thiếu lựa chọn"
                    : !answer
                        ? "Chưa nhận diện đáp án"
                        : "Đáp án không khớp lựa chọn"
        };

        result.push(item);
        last = item;

        q = [];
        opts = [];
        answer = "";
        notes = [];
        image = "";
        active = -1;
    }


    // Nhận diện đáp án và ghi chú.
    function getAnswer(line) {
        let m = line.match(answerPattern) ||
            line.match(shortAnswerPattern);

        if (!m) {
            // Hỗ trợ dạng A. kèm giải thích phía sau.
            const noteAnswer = line.match(/^([A-F])[.。]\s+(.+)$/i);

            if (
                noteAnswer &&
                opts.some(x => x.key === noteAnswer[1].toUpperCase())
            ) {
                return {
                    answer: noteAnswer[1].toUpperCase(),
                    note: noteAnswer[2]
                };
            }

            return null;
        }

        const letters = m[1].toUpperCase().match(/[A-F]/g) || [];

        return {
            answer: [...new Set(letters)].join(""),
            note: m[2] || ""
        };
    }


    for (const rawLine of lines) {
        const line = rawLine.trim();

        if (!line) continue;

        // Bỏ các dòng không phải nội dung câu hỏi.
        if (/^(?:star\s+filled|sound)$/i.test(line)) {
            continue;
        }


        // =========================
        // XỬ LÝ IMAGE
        // =========================

        if (/^image\s*:/i.test(line)) {
            const value = line.replace(/^image\s*:\s*/i, "").trim();

            if (q.length || opts.length) {
                image = value;
                skipImageBlock = false;
                imageStarted = false;
            } else {
                if (last) {
                    last.image = value;
                }

                skipImageBlock = true;
                imageStarted = false;
            }

            continue;
        }


        // Bỏ qua khối câu hỏi bị lặp trong Image.
        if (skipImageBlock) {

            if (
                !imageStarted &&
                last &&
                norm(line) === norm(last.question)
            ) {
                imageStarted = true;
                continue;
            }

            const imageOption = line.match(optionPattern);

            if (imageOption) {
                imageStarted = true;
                continue;
            }

            const imageAnswer = getAnswer(line);

            if (imageStarted && imageAnswer) {
                continue;
            }

            // Nếu không còn thuộc khối Image thì bắt đầu câu mới.
            skipImageBlock = false;
            imageStarted = false;
        }


        // =========================
        // PHÁT HIỆN CÂU MỚI
        // =========================

        const numbered =
            /^\s*(?:(?:question|q)\s*)?\d{1,4}\s*[.)、:-]\s*\S/i
                .test(rawLine);

        if (numbered && (q.length || opts.length)) {
            finish();
        }


        const option = line.match(optionPattern);
        const answerData = getAnswer(line);


        // =========================
        // XỬ LÝ ĐÁP ÁN
        // =========================

        if (answerData && opts.length >= 2 && q.length) {
            answer = answerData.answer;

            if (answerData.note) {
                notes.push(answerData.note.trim());
            }

            finish();
            continue;
        }


        // =========================
        // XỬ LÝ LỰA CHỌN
        // =========================

        if (option && q.length) {
            const key = option[1].toUpperCase();
            const value = option[2].trim();

            const existingIndex = opts.findIndex(x => x.key === key);

            if (existingIndex >= 0) {

                // Tránh tạo lựa chọn trùng chữ cái.
                if (norm(opts[existingIndex].text) !== norm(value)) {
                    opts[existingIndex].text +=
                        (opts[existingIndex].text ? " " : "") + value;
                }

                active = existingIndex;

            } else {
                opts.push({
                    key,
                    text: value
                });

                active = opts.length - 1;
            }

            continue;
        }


        // =========================
        // XỬ LÝ GHI CHÚ
        // =========================

        if (/^\(.*\)$/.test(line) && opts.length) {
            notes.push(line);
            continue;
        }


        // Ghi chú đặt sau đáp án của câu vừa hoàn tất.
        if (
            !q.length &&
            !opts.length &&
            last &&
            /^\(.*\)$/.test(line)
        ) {
            last.notes = [last.notes, line]
                .filter(Boolean)
                .join(" ");

            continue;
        }


        // =========================
        // NỐI DÒNG BỊ XUỐNG HÀNG
        // =========================

        if (opts.length && active >= 0) {
            opts[active].text +=
                (opts[active].text ? " " : "") + line;
        } else {
            q.push(clean(line));
        }
    }

    finish();

    return result.filter(x => x.question || x.options.length);
}


// =========================
// XEM TRƯỚC CÂU HỎI
// =========================

function showPreview() {
    let raw = $("raw").value.trim();

    if (!raw) {
        return toast("Bạn chưa dán câu hỏi.");
    }

    preview = parse(raw);

    let good = preview.filter(q => q.valid).length;

    $("preview-panel").classList.remove("hidden");

    $("summary").textContent =
        `Nhận diện ${preview.length} câu · ${good} câu hợp lệ`;

    $("warnings").textContent =
        good === preview.length
            ? "Tất cả câu hỏi sẵn sàng để lưu."
            : "Câu lỗi sẽ không được lưu.";

    $("save").disabled = !good;

    $("save").textContent = "Lưu vào " + importCourse;

    $("preview-list").innerHTML = preview.map((q, i) => `
        <div class="preview-item ${q.valid ? "" : "bad"}">
            <b>${q.valid ? "✓" : "!"} Câu ${i + 1}</b>

            <p>${esc(q.question)}</p>

            <small>
                ${
                    q.valid
                        ? "Đáp án: " + esc(q.answer) +
                          " · " + q.options.length + " lựa chọn"
                        : esc(q.issue)
                }
            </small>

            ${
                q.notes
                    ? `<p>Ghi chú: ${esc(q.notes)}</p>`
                    : ""
            }

            ${
                q.image
                    ? `<p>Image note: ${esc(q.image)}</p>`
                    : ""
            }
        </div>
    `).join("");
}


// =========================
// BẮT ĐẦU HỌC
// =========================

function start(m) {
    let all = db[course];

    if (!all.length) {
        return toast("Hãy nhập câu hỏi cho " + course + " trước.");
    }

    mode = m;

    items = m === "wrong"
        ? all.filter(q => db.progress[course][q.id]?.wrong)
        : [...all];

    if (!items.length) {
        return toast("Chưa có câu sai để ôn.");
    }

    items.sort(() => Math.random() - 0.5);

    at = 0;
    chosen = [];
    done = false;

    $("study").classList.remove("hidden");

    $("study-label").textContent =
        course + " · " +
        (
            m === "flash"
                ? "FLASHCARDS"
                : m === "quiz"
                    ? "TRẮC NGHIỆM"
                    : "ÔN CÂU SAI"
        );

    drawStudy();
}


// =========================
// LƯU TIẾN ĐỘ
// =========================

function progress(q, correct) {
    let p = db.progress[course];

    let x = p[q.id] || {
        attempts: 0,
        correct: 0,
        wrong: false
    };

    x.attempts++;

    if (correct) {
        x.correct++;
        x.wrong = false;
    } else {
        x.wrong = true;
    }

    p[q.id] = x;

    save();
}


// =========================
// HIỂN THỊ CÂU HỌC
// =========================

function drawStudy() {
    let q = items[at];

    $("position").textContent =
        (at + 1) + " / " + items.length;

    $("study-bar").style.width =
        ((at + 1) / items.length * 100) + "%";


    if (mode === "flash") {

        $("study-content").innerHTML = `
            <div class="study-card">
                <small class="study-type">CÂU HỎI</small>

                <div class="study-question">
                    ${esc(q.question)}
                </div>

                <div id="flash-answer" class="study-answer hidden">
                    ${q.options.map(o =>
                        esc(o.key + ". " + o.text)
                    ).join("<br>")}

                    <br><br>

                    <b>Đáp án đúng: ${esc(q.answer)}</b>

                    ${q.notes ? "<br>" + esc(q.notes) : ""}
                </div>

                <p class="study-hint">
                    Tự suy nghĩ trước khi xem đáp án
                </p>
            </div>
        `;

        $("study-actions").innerHTML =
            '<button class="primary" id="reveal">Hiện đáp án</button>';

        $("reveal").onclick = () => {

            $("flash-answer").classList.remove("hidden");

            $("study-actions").innerHTML = `
                <button class="primary" id="again">Cần học lại</button>
                <button class="primary" id="known">Đã nhớ ✓</button>
            `;

            $("again").onclick = () => {
                progress(q, false);
                next();
            };

            $("known").onclick = () => {
                progress(q, true);
                next();
            };
        };

    } else {

        $("study-content").innerHTML = `
            <div class="study-card">
                <small class="study-type">CHỌN ĐÁP ÁN ĐÚNG</small>

                <div class="study-question">
                    ${esc(q.question)}
                </div>
            </div>

            <div>
                ${q.options.map(o => `
                    <button class="option" data-opt="${o.key}">
                        <b>${o.key}.</b>${esc(o.text)}
                    </button>
                `).join("")}
            </div>

            <p id="feedback" class="feedback"></p>
        `;

        $("study-actions").innerHTML =
            '<button class="primary" id="check">Kiểm tra đáp án</button>';

        document.querySelectorAll("[data-opt]").forEach(b => {

            b.onclick = () => {
                if (done) return;

                let k = b.dataset.opt;

                chosen = chosen.includes(k)
                    ? chosen.filter(x => x !== k)
                    : [...chosen, k];

                b.classList.toggle("selected", chosen.includes(k));
            };
        });


        $("check").onclick = () => {
            if (done) return;

            if (!chosen.length) {
                return toast("Hãy chọn ít nhất một đáp án.");
            }

            done = true;

            let ok = [...chosen].sort().join("") ===
                [...q.answer].sort().join("");

            progress(q, ok);

            document.querySelectorAll("[data-opt]").forEach(b => {
                b.disabled = true;

                if (q.answer.includes(b.dataset.opt)) {
                    b.classList.add("good");
                } else if (chosen.includes(b.dataset.opt)) {
                    b.classList.add("bad");
                }
            });

            $("feedback").innerHTML = `
                <span style="color:${ok ? "#78d6aa" : "#e99aa3"}">
                    ${ok ? "Chính xác!" : "Chưa đúng."}

                    Đáp án: <b>${esc(q.answer)}</b>

                    ${q.notes ? "<br>" + esc(q.notes) : ""}
                </span>
            `;

            $("study-actions").innerHTML =
                '<button class="primary" id="next">Câu tiếp theo →</button>';

            $("next").onclick = next;
        };
    }
}


// =========================
// CÂU TIẾP THEO
// =========================

function next() {
    at++;

    if (at >= items.length) {

        $("study-content").innerHTML = `
            <div class="study-card">
                <small class="study-type">HOÀN THÀNH</small>

                <div class="study-question">
                    Bạn đã học hết lượt này!
                </div>

                <p>
                    Tiếp tục luyện tập để ghi nhớ lâu hơn nhé.
                </p>
            </div>
        `;

        $("study-actions").innerHTML =
            '<button class="primary" id="finish">Về trang chủ</button>';

        $("finish").onclick = () => {
            $("study").classList.add("hidden");
            render();
        };

        render();

        return;
    }

    chosen = [];
    done = false;

    drawStudy();
}


// =========================
// CHỌN MÔN HỌC
// =========================

document.querySelectorAll(".course").forEach(b => {

    b.onclick = () => {
        course = b.dataset.course;

        document.querySelectorAll(".course").forEach(x => {
            x.classList.toggle("active", x === b);
        });

        render();
    };
});


// =========================
// CHỌN MÔN NHẬP CÂU HỎI
// =========================

document.querySelectorAll("[data-import]").forEach(b => {

    b.onclick = () => {
        importCourse = b.dataset.import;

        document.querySelectorAll(".tab").forEach(x => {
            x.classList.toggle("active", x === b);
        });

        $("import-course").textContent = "· " + importCourse;

        $("raw").value = "";

        $("preview-panel").classList.add("hidden");
    };
});


// =========================
// CHỌN CHẾ ĐỘ HỌC
// =========================

document.querySelectorAll("[data-mode]").forEach(b => {
    b.onclick = () => start(b.dataset.mode);
});


// =========================
// XEM TRƯỚC VÀ LƯU CÂU HỎI
// =========================

$("preview").onclick = showPreview;

$("close-preview").onclick = () => {
    $("preview-panel").classList.add("hidden");
};


// Lưu câu hỏi theo kiểu thêm mới hoặc cập nhật câu cũ.
$("save").onclick = () => {

    let added = 0;
    let updated = 0;

    const target = db[importCourse];

    for (const q of preview.filter(x => x.valid)) {

        const key = q.question.trim().toLowerCase();

        const index = target.findIndex(old =>
            old.question.trim().toLowerCase() === key
        );

        if (index >= 0) {

            // Cập nhật nội dung nhưng giữ ID cũ để giữ tiến độ học.
            const old = target[index];

            target[index] = {
                ...q,
                id: old.id
            };

            updated++;

        } else {

            // Thêm câu hỏi mới.
            target.push({
                ...q,
                id: crypto.randomUUID
                    ? crypto.randomUUID()
                    : String(Date.now() + Math.random())
            });

            added++;
        }
    }

    save();
    render();

    $("raw").value = "";

    $("preview-panel").classList.add("hidden");

    toast(
        "Đã cập nhật " + updated +
        " câu, thêm " + added +
        " câu vào " + importCourse
    );
};


// =========================
// HƯỚNG DẪN ĐỊNH DẠNG
// =========================

$("format").onclick = () => alert(
    "Có thể nhập câu không đánh số. " +
    "Lựa chọn hỗ trợ A., A), A:, A-, A, hoặc A + dấu cách; " +
    "chấp nhận A–F. " +
    "Đáp án đặt riêng một dòng: A, A., AB, A B, ACD hoặc Answer: A. " +
    "Dòng A. kèm giải thích cũng được nhận diện. " +
    "Dòng xuống hàng trong câu hỏi/lựa chọn được nối lại. " +
    "Khối Image bị lặp sẽ được bỏ qua."
);


// =========================
// XÓA NGÂN HÀNG CÂU HỎI
// =========================

$("clear").onclick = () => {

    if (!db[course].length) {
        return toast("Ngân hàng đang trống.");
    }

    if (confirm("Xóa toàn bộ câu hỏi và tiến độ của " + course + "?")) {

        db[course] = [];
        db.progress[course] = {};

        save();
        render();

        toast("Đã xóa dữ liệu " + course);
    }
};


// =========================
// XÓA MỘT CÂU HỎI
// =========================

$("bank-list").onclick = e => {

    let b = e.target.closest("[data-del]");

    if (!b) return;

    let i = +b.dataset.del;

    if (confirm("Xóa câu hỏi này?")) {

        let q = db[course].splice(i, 1)[0];

        delete db.progress[course][q.id];

        save();
        render();
    }
};


// =========================
// THOÁT VÀ KHỞI TẠO
// =========================

$("exit").onclick = () => {
    $("study").classList.add("hidden");
};

render();
