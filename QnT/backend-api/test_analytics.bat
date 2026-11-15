@echo off
REM ═══════════════════════════════════════════════════════════
REM Test Analytics APIs — Chạy trên PowerShell hoặc CMD
REM Backend phải đang chạy trên localhost:4000
REM ═══════════════════════════════════════════════════════════

echo.
echo ═══ STEP 1: Login lay JWT token ═══
echo.

REM Dùng curl login admin
curl -s -X POST http://localhost:4000/api/v1/auth/admin/login ^
  -H "Content-Type: application/json" ^
  -d "{\"email\":\"admin@qnt.com\",\"password\":\"Admin@123\"}" > login_response.json

echo Login response:
type login_response.json
echo.
echo.
echo ═══════════════════════════════════════════════════════════
echo Copy token tu response phia tren, roi chay cac lenh ben duoi
echo Thay YOUR_TOKEN bang token thuc te
echo ═══════════════════════════════════════════════════════════
echo.

set TOKEN=YOUR_TOKEN

echo ═══ STEP 2: Admin Overview ═══
curl -s http://localhost:4000/api/v1/analytics/admin/overview -H "Authorization: Bearer %TOKEN%" | python -m json.tool
echo.

echo ═══ STEP 3: Revenue by Month ═══
curl -s http://localhost:4000/api/v1/analytics/admin/revenue-by-month -H "Authorization: Bearer %TOKEN%" | python -m json.tool
echo.

echo ═══ STEP 4: Order Status ═══
curl -s http://localhost:4000/api/v1/analytics/admin/order-status -H "Authorization: Bearer %TOKEN%" | python -m json.tool
echo.

echo ═══ STEP 5: Payment Methods ═══
curl -s http://localhost:4000/api/v1/analytics/admin/payment-methods -H "Authorization: Bearer %TOKEN%" | python -m json.tool
echo.

echo ═══ STEP 6: Seller Overview ═══
curl -s http://localhost:4000/api/v1/analytics/seller/overview -H "Authorization: Bearer %TOKEN%" | python -m json.tool
echo.

echo ═══ STEP 7: Tax Report ═══
curl -s http://localhost:4000/api/v1/analytics/tax/report -H "Authorization: Bearer %TOKEN%" | python -m json.tool
echo.

echo ═══ STEP 8: Audit Events ═══
curl -s "http://localhost:4000/api/v1/analytics/audit/events?limit=5" -H "Authorization: Bearer %TOKEN%" | python -m json.tool
echo.

del login_response.json 2>nul
echo Done!
