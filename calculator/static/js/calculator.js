(() => {
    const exprEl = document.getElementById("expression");
    const resultEl = document.getElementById("result");
    const historyList = document.getElementById("history-list");
    const memoryIndicator = document.getElementById("memory-indicator");
    const angleToggle = document.getElementById("angle-toggle");
    const themeToggle = document.getElementById("theme-toggle");
    const clearHistoryBtn = document.getElementById("clear-history");

    let expression = "";
    let angleMode = "deg";
    let memory = 0;
    let justEvaluated = false;

    const OPERATORS = ["+", "−", "×", "÷", "^", "/100"];

    // ---------- Rendering ----------
    function render() {
        exprEl.textContent = expression;
        if (!resultEl.classList.contains("error") && expression === "" && !justEvaluated) {
            resultEl.textContent = "0";
        }
    }

    function showResult(text, isError = false) {
        resultEl.textContent = text;
        resultEl.classList.toggle("error", isError);
    }

    function updateMemoryIndicator() {
        memoryIndicator.textContent = memory !== 0 ? "M = " + memory : "";
    }

    // ---------- Input handling ----------
    function append(value) {
        resultEl.classList.remove("error");
        const isOperator = OPERATORS.includes(value);

        if (justEvaluated) {
            if (!isOperator) expression = "";
            justEvaluated = false;
        }

        const last = expression.slice(-1);
        if (isOperator && value !== "/100" && ["+", "−", "×", "÷", "^"].includes(last)) {
            expression = expression.slice(0, -1);
        }

        if (expression === "" && isOperator && value !== "−") {
            if (value === "/100") return;
            expression = "0";
        }

        if (value === ".") {
            const currentNumber = expression.split(/[+\−×÷^()]/).pop();
            if (currentNumber.includes(".")) return;
        }

        expression += value;
        showResult(expression === "" ? "0" : lastNumber());
        render();
    }

    function lastNumber() {
        const match = expression.match(/[\d.]+$/);
        return match ? match[0] : resultEl.textContent;
    }

    function clearAll() {
        expression = "";
        justEvaluated = false;
        showResult("0");
        render();
    }

    function backspace() {
        if (justEvaluated) return clearAll();
        const tokens = ["sin(", "cos(", "tan(", "log(", "ln(", "√(", "fact(", "abs(", "1/(", "/100"];
        const token = tokens.find((t) => expression.endsWith(t));
        expression = token ? expression.slice(0, -token.length) : expression.slice(0, -1);
        resultEl.classList.remove("error");
        showResult(expression === "" ? "0" : lastNumber());
        render();
    }

    function negate() {
        if (expression === "") return;
        if (expression.startsWith("−(") && expression.endsWith(")")) {
            expression = expression.slice(2, -1);
        } else {
            expression = "−(" + expression + ")";
        }
        justEvaluated = false;
        render();
    }

    // ---------- Server calls ----------
    async function calculate() {
        if (expression === "") return;

        const open = (expression.match(/\(/g) || []).length;
        const close = (expression.match(/\)/g) || []).length;
        if (open > close) expression += ")".repeat(open - close);

        try {
            const response = await fetch("/api/calculate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ expression, angle_mode: angleMode }),
            });
            const data = await response.json();

            if (!response.ok) {
                showResult(data.error || "Error", true);
                return;
            }

            exprEl.textContent = expression + " =";
            showResult(data.result);
            expression = data.result;
            justEvaluated = true;
            loadHistory();
        } catch (err) {
            showResult("Server error", true);
        }
    }

    async function loadHistory() {
        try {
            const response = await fetch("/api/history");
            const items = await response.json();
            historyList.innerHTML = "";

            if (!items.length) {
                historyList.innerHTML = '<li class="history-empty">No calculations yet</li>';
                return;
            }

            items.forEach((item) => {
                const li = document.createElement("li");
                const expr = document.createElement("div");
                expr.className = "h-expr";
                expr.textContent = item.expression;
                const res = document.createElement("div");
                res.className = "h-result";
                res.textContent = "= " + item.result;
                li.append(expr, res);
                li.addEventListener("click", () => {
                    expression = item.expression;
                    justEvaluated = false;
                    showResult(item.result);
                    render();
                });
                historyList.appendChild(li);
            });
        } catch (err) {
            historyList.innerHTML = '<li class="history-empty">Could not load history</li>';
        }
    }

    async function clearHistory() {
        await fetch("/api/history", { method: "DELETE" });
        loadHistory();
    }

    // ---------- Memory ----------
    function currentValue() {
        const num = parseFloat(resultEl.textContent);
        return isNaN(num) ? 0 : num;
    }

    function memoryAction(action) {
        if (action === "mc") memory = 0;
        if (action === "m-plus") memory += currentValue();
        if (action === "m-minus") memory -= currentValue();
        if (action === "mr") {
            append(String(memory));
        }
        memory = Math.round(memory * 1e10) / 1e10;
        updateMemoryIndicator();
    }

    // ---------- Event wiring ----------
    document.querySelectorAll(".btn").forEach((btn) => {
        btn.addEventListener("click", () => {
            const action = btn.dataset.action;
            const value = btn.dataset.value;

            if (value !== undefined) return append(value);

            switch (action) {
                case "clear": return clearAll();
                case "backspace": return backspace();
                case "equals": return calculate();
                case "negate": return negate();
                case "mc":
                case "mr":
                case "m-plus":
                case "m-minus": return memoryAction(action);
            }
        });
    });

    angleToggle.addEventListener("click", () => {
        angleMode = angleMode === "deg" ? "rad" : "deg";
        angleToggle.textContent = angleMode.toUpperCase();
    });

    themeToggle.addEventListener("click", () => {
        const root = document.documentElement;
        const next = root.dataset.theme === "dark" ? "light" : "dark";
        root.dataset.theme = next;
        try { localStorage.setItem("calc-theme", next); } catch (e) {}
    });

    clearHistoryBtn.addEventListener("click", clearHistory);

    // ---------- Keyboard support ----------
    document.addEventListener("keydown", (event) => {
        const key = event.key;

        if (/^[0-9.]$/.test(key)) return append(key);
        if (key === "+") return append("+");
        if (key === "-") return append("−");
        if (key === "*") return append("×");
        if (key === "/") { event.preventDefault(); return append("÷"); }
        if (key === "^") return append("^");
        if (key === "(" || key === ")") return append(key);
        if (key === "%") return append("/100");
        if (key === "Enter" || key === "=") { event.preventDefault(); return calculate(); }
        if (key === "Backspace") return backspace();
        if (key === "Escape" || key === "Delete") return clearAll();
    });

    // ---------- Init ----------
    try {
        const saved = localStorage.getItem("calc-theme");
        if (saved) document.documentElement.dataset.theme = saved;
    } catch (e) {}

    loadHistory();
    updateMemoryIndicator();
    render();
})();
