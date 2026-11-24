# Flask Scientific Calculator

Flask backend + HTML/CSS/JavaScript frontend.

## Run
    pip install -r requirements.txt
    python app.py
Open http://127.0.0.1:5000

## Production
Set a real secret key before deploying:
    export SECRET_KEY="your-long-random-string"
Run with a WSGI server, e.g. `gunicorn app:app`.
