// frontend-app\src\components\tax\TaxReportTable.js

'use client';

export default function TaxReportTable() {
  return (
    <div className="bg-white rounded-lg shadow overflow-hidden">
      <table className="min-w-full">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Order ID</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Thuế</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Hash</th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          <tr>
            <td className="px-6 py-4 text-sm text-gray-500" colSpan="3">Chưa có dữ liệu</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
