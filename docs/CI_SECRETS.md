# CI/CD Secrets Configuration

The following GitHub repository secrets must be configured in `Settings -> Secrets and variables -> Actions`:

| Secret Name | Purpose | Example / Format |
|---|---|---|
| `APPLE_ID` | Apple Developer Account email address | `developer@olympian.com` |
| `APP_PASSWORD` | App-specific password generated for `xcrun altool` / notarization | `xxxx-xxxx-xxxx-xxxx` |
| `GOOGLE_PLAY_KEY` | Service Account JSON credentials string with permissions to upload releases to Play Console internal track | `{"type": "service_account", ...}` |
