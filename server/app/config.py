import os
from dotenv import load_dotenv

load_dotenv()

class Settings:
    PROJECT_NAME: str = "CDSS Outpatient Clinic API"
    VERSION: str = "1.0.0"
    DATABASE_URL: str = os.getenv("DATABASE_URL", "")

settings = Settings()