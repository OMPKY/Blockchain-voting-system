import dotenv
import os
import mysql.connector
from fastapi import FastAPI, HTTPException, status, Request
from fastapi.middleware.cors import CORSMiddleware
from mysql.connector import errorcode
import jwt

# Loading the environment variables
dotenv.load_dotenv()

app = FastAPI()

# 🔹 FIX 1: CORS Origins (Ready for Cloud)
origins = [
    "http://localhost:3000",    # Local Node.js Web Server
    "http://127.0.0.1:3000",
    "http://localhost:8080",    # Local Python API
    "http://127.0.0.1:8080",
    # 🚨 DEPLOYMENT STEP: Once you deploy your Node.js app to Render, 
    # you MUST add your live website URL here so Python allows it to connect!
    # Example: "https://your-node-app-name.onrender.com"
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 🔹 FIX 2: Better Database Connection Management
def get_db_connection():
    try:
        conn = mysql.connector.connect(
            user=os.environ['MYSQL_USER'],
            password=os.environ['MYSQL_PASSWORD'],
            host=os.environ['MYSQL_HOST'],
            port=int(os.environ.get('MYSQL_PORT', 27071)),
            database=os.environ['MYSQL_DB'],
            ssl_disabled=False
        )
        return conn
    except mysql.connector.Error as err:
        print(f"❌ Connection Error: {err}")
        return None

# Initial connection
cnx = get_db_connection()
if cnx:
    cursor = cnx.cursor(buffered=True)

# 🔹 FIX 3: Reconnect logic inside the role check
async def get_role(voter_id, password):
    global cnx, cursor
    try:
        # Check if connection is still alive, if not, reconnect
        if cnx is None or not cnx.is_connected():
            print("🔄 Reconnecting to Aiven MySQL...")
            cnx = get_db_connection()
            cursor = cnx.cursor(buffered=True)
            
        query = "SELECT role FROM voters WHERE voter_id = %s AND password = %s"
        cursor.execute(query, (voter_id, password))
        result = cursor.fetchone()
        
        if result:
            return result[0]
        else:
            return None # Return None instead of raising here to handle custom message
            
    except mysql.connector.Error as err:
        print(f"Database Error: {err}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Database connection issue"
        )

# 🔹 FIX 4: Secure POST Login
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

    # Convert bytes to string if necessary (for older PyJWT versions)
    if isinstance(token, bytes):
        token = token.decode('utf-8')

    return {'token': token, 'role': role}

# 🔹 FIX 5: Dynamic Port for Cloud Deployment
if __name__ == "__main__":
    import uvicorn
    # Render provides the PORT dynamically. If missing (local), use 8080.
    port = int(os.environ.get("PORT", 8080))
    # 0.0.0.0 exposes the server to the internet instead of locking it to localhost
    uvicorn.run(app, host="0.0.0.0", port=port)