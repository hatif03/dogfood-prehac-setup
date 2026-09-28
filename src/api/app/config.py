from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "sqlite+pysqlite:///./portal.db"
    redis_url: str = ""
    minio_endpoint: str = "localhost:9000"
    minio_access_key: str = "minio"
    minio_secret_key: str = "minio-minio"
    minio_bucket: str = "portal"
    minio_secure: bool = False
    session_secret: str = "dev-secret"
    smtp_host: str = "localhost"
    smtp_port: int = 1025
    mail_from: str = "portal@localhost"
    public_url: str = "http://localhost:8080"
    cors_origins: str = "http://localhost:8080,http://localhost:3000"
    seed_on_boot: bool = True
    fixtures_path: str = "../../spec/fixtures.json"
    # Fixed, printed session tokens so the acceptance checker can attach a header. Turn off in production.
    demo_sessions: bool = True
    signing_key_path: str = "./ed25519.pem"
    session_hours: int = 72
    vote_rate_limit: int = 30
    vote_rate_window_seconds: int = 60
    login_rate_limit: int = 10
    comment_rate_limit: int = 5
    open_ballots_per_ip_per_day: int = 20
    gallery_rate_limit: int = 120
    gallery_rate_window_seconds: int = 60
    webhook_worker: bool = True
    trust_proxy: bool = False
    max_upload_bytes: int = 5 * 1024 * 1024


settings = Settings()
