// frontend-app\src\app\seller\finance\page.js

export default function SellerFinancePage() {
  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">Ví tiền</h1>
      <div className="bg-white rounded-lg shadow-md p-6">
        <p>Số dư: 0 ₫</p>
        <p className="text-sm text-gray-500 mt-2">Kết nối với Blockchain để xem lịch sử giao dịch</p>
      </div>
    </div>
  );
}
