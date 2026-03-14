import dotenv
import os
import pymysql
from fastapi import FastAPI, HTTPException, status, Request
from fastapi.middleware.cors import CORSMiddleware
import jwt

# Loading the environment variables
dotenv.load_dotenv()

app = FastAPI()

# 🔹 FIX 1: Added your Live Website URL to the security list!
origins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:8080",
    "http://127.0.0.1:8080",
    "https://blockchain-voting-system-noyy.onrender.com"  # Your frontend!
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 🔹 FIX 2: Using PyMySQL to avoid the Render Linux bug
def get_db_connection():
    try:
        conn = pymysql.connect(
            user=os.environ['MYSQL_USER'],
            password=os.environ['MYSQL_PASSWORD'],
            host=os.environ['MYSQL_HOST'],
            port=int(os.environ.get('MYSQL_PORT', 27071)),
            database=os.environ['MYSQL_DB'],
            autocommit=True
        )
        return conn
    except Exception as err:
        print(f"❌ Connection Error: {err}")
        return None

cnx = get_db_connection()
if cnx:
    cursor = cnx.cursor()

async def get_role(voter_id, password):
    global cnx, cursor
    try:
        if cnx is None or not cnx.open:
            print("🔄 Reconnecting to Aiven MySQL...")
            cnx = get_db_connection()
            cursor = cnx.cursor()
            
        query = "SELECT role FROM voters WHERE voter_id = %s AND password = %s"
        cursor.execute(query, (voter_id, password))
        result = cursor.fetchone()
        
        if result:
            return result[0]
        else:
            return None
            
    except Exception as err:
        print(f"Database Error: {err}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Database connection issue"
        )

@app.post("/login")
async def login(request: Request):
    try:
        data = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    voter_id = data.get("voter_id")
    password = data.get("password")

    if not voter_id or not password:
        raise HTTPException(status_code=400, detail="Missing credentials")

    role = await get_role(voter_id, password)

    if not role:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid voter ID or password"
        )

    token = jwt.encode(
        {'voter_id': voter_id, 'role': role}, 
        os.environ['SECRET_KEY'], 
        algorithm='HS256'
    )

    if isinstance(token, bytes):
        token = token.decode('utf-8')

    return {'token': token, 'role': role}

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8080))
    uvicorn.run(app, host="0.0.0.0", port=port)