import ast
import math
import operator
import os

from flask import Flask, jsonify, render_template, request, session

app = Flask(__name__)
app.secret_key = os.environ.get("SECRET_KEY", "change-this-to-a-random-secret-key")

MAX_EXPR_LENGTH = 200
MAX_HISTORY = 20

BIN_OPS = {
    ast.Add: operator.add,
    ast.Sub: operator.sub,
    ast.Mult: operator.mul,
    ast.Div: operator.truediv,
    ast.Pow: operator.pow,
    ast.Mod: operator.mod,
    ast.FloorDiv: operator.floordiv,
}

UNARY_OPS = {
    ast.UAdd: operator.pos,
    ast.USub: operator.neg,
}


class CalcError(Exception):
    """Raised for any user-facing calculation problem."""


def build_functions(angle_mode):
    """Return the allowed functions, respecting degree/radian mode."""
    to_rad = (lambda x: math.radians(x)) if angle_mode == "deg" else (lambda x: x)

    def factorial(x):
        if x < 0 or int(x) != x:
            raise CalcError("Factorial needs a non-negative integer")
        if x > 170:
            raise CalcError("Number too large")
        return math.factorial(int(x))

    def safe_tan(x):
        rad = to_rad(x)
        if abs(math.cos(rad)) < 1e-12:
            raise CalcError("tan undefined")
        return math.tan(rad)

    return {
        "sin": lambda x: math.sin(to_rad(x)),
        "cos": lambda x: math.cos(to_rad(x)),
        "tan": safe_tan,
        "log": math.log10,
        "ln": math.log,
        "sqrt": math.sqrt,
        "abs": abs,
        "fact": factorial,
    }


CONSTANTS = {"pi": math.pi, "e": math.e}


def normalize(expr):
    """Convert display symbols into Python-friendly syntax."""
    replacements = {
        "×": "*",
        "÷": "/",
        "−": "-",
        "^": "**",
        "π": "pi",
        "√": "sqrt",
    }
    for old, new in replacements.items():
        expr = expr.replace(old, new)
    return expr


def evaluate(node, funcs):
    if isinstance(node, ast.Expression):
        return evaluate(node.body, funcs)

    if isinstance(node, ast.Constant):
        if isinstance(node.value, (int, float)) and not isinstance(node.value, bool):
            return node.value
        raise CalcError("Invalid value")

    if isinstance(node, ast.BinOp):
        op_type = type(node.op)
        if op_type not in BIN_OPS:
            raise CalcError("Unsupported operator")
        left = evaluate(node.left, funcs)
        right = evaluate(node.right, funcs)
        if op_type is ast.Pow and abs(right) > 1000:
            raise CalcError("Exponent too large")
        return BIN_OPS[op_type](left, right)

    if isinstance(node, ast.UnaryOp):
        op_type = type(node.op)
        if op_type not in UNARY_OPS:
            raise CalcError("Unsupported operator")
        return UNARY_OPS[op_type](evaluate(node.operand, funcs))

    if isinstance(node, ast.Name):
        if node.id in CONSTANTS:
            return CONSTANTS[node.id]
        raise CalcError(f"Unknown name: {node.id}")

    if isinstance(node, ast.Call):
        if not isinstance(node.func, ast.Name) or node.func.id not in funcs:
            raise CalcError("Unknown function")
        if len(node.args) != 1 or node.keywords:
            raise CalcError("Functions take one argument")
        return funcs[node.func.id](evaluate(node.args[0], funcs))

    raise CalcError("Invalid expression")


def format_result(value):
    if isinstance(value, complex):
        raise CalcError("Result is not a real number")
    if isinstance(value, float):
        if math.isnan(value) or math.isinf(value):
            raise CalcError("Result is not a number")
        if value == int(value) and abs(value) < 1e15:
            return str(int(value))
        return f"{value:.12g}"
    return str(value)


def calculate(expression, angle_mode="deg"):
    expression = (expression or "").strip()
    if not expression:
        raise CalcError("Empty expression")
    if len(expression) > MAX_EXPR_LENGTH:
        raise CalcError("Expression too long")

    try:
        tree = ast.parse(normalize(expression), mode="eval")
        value = evaluate(tree, build_functions(angle_mode))
        return format_result(value)
    except CalcError:
        raise
    except ZeroDivisionError:
        raise CalcError("Cannot divide by zero")
    except (ValueError, OverflowError):
        raise CalcError("Math error")
    except SyntaxError:
        raise CalcError("Syntax error")
    except RecursionError:
        raise CalcError("Expression too complex")


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/calculate", methods=["POST"])
def api_calculate():
    data = request.get_json(silent=True) or {}
    expression = data.get("expression", "")
    angle_mode = data.get("angle_mode", "deg")
    if angle_mode not in ("deg", "rad"):
        angle_mode = "deg"

    try:
        result = calculate(expression, angle_mode)
    except CalcError as exc:
        return jsonify({"error": str(exc)}), 400

    history = session.get("history", [])
    history.insert(0, {"expression": expression, "result": result})
    session["history"] = history[:MAX_HISTORY]

    return jsonify({"result": result})


@app.route("/api/history", methods=["GET"])
def api_history():
    return jsonify(session.get("history", []))


@app.route("/api/history", methods=["DELETE"])
def api_clear_history():
    session["history"] = []
    return jsonify({"status": "cleared"})


if __name__ == "__main__":
    app.run(debug=os.environ.get("FLASK_DEBUG") == "1")
