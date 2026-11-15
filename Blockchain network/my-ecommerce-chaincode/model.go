// my-ecommerce-chaincode\model.go

package main

// ===================================================================================
// CONSTANTS
// ===================================================================================
const (
	DocTypeOrder                 = "Order"
	CollectionSellerMarketplace  = "collectionSellerMarketplace"
	CollectionShipperMarketplace = "collectionShipperMarketplace"
	CollectionTaxMarketplace     = "collectionTaxMarketplace"

	// --- World State Config Keys ---
	KeyTaxConfig      = "TAX_CONFIG"
	KeyBusinessConfig = "BUSINESS_CONFIG"

	// --- Status (Trạng thái đơn hàng) ---
	StatusCreated         = "CREATED"
	StatusPaid            = "PAID"
	StatusShipping        = "SHIPPED"
	StatusDelivered       = "DELIVERED"
	StatusSettled         = "SETTLED"
	StatusCancelled       = "CANCELLED"
	StatusReturnRequested = "RETURN_REQUESTED"
	StatusReturnInTransit = "RETURN_IN_TRANSIT"
	StatusReturnedSuccess = "RETURNED"

	// --- Payment & COD ---
	PaymentPrepaid       = "PREPAID"
	PaymentCOD           = "COD"
	CodNotCollected      = "NOT_COLLECTED"
	CodPendingRemittance = "PENDING_REMITTANCE"
	CodRemitted          = "REMITTED"
)

// ===================================================================================
// PUBLIC STATE (Lưu trên Ledger chung)
// ===================================================================================
type Order struct {
	DocType       string `json:"docType"`
	OrderID       string `json:"orderID"`
	Status        string `json:"status"`
	PaymentMethod string `json:"paymentMethod"`
	CodStatus     string `json:"codStatus"`

	// --- CẤP ĐỘ TỔ CHỨC (MSP) ---
	SellerID  string `json:"sellerID"`
	ShipperID string `json:"shipperID"`

	// --- CẤP ĐỘ CÔNG TY/CỬA HÀNG ---
	SellerCompanyID  string `json:"sellerCompanyID"`
	ShipperCompanyID string `json:"shipperCompanyID"`

	VATRate float64 `json:"vatRate"`

	CreatedAt         string `json:"createdAt"`
	UpdatedAt         string `json:"updatedAt"`
	DeliveryTimestamp string `json:"deliveryTimestamp"`

	PaidAt            string `json:"paidAt"`
	ShippedAt         string `json:"shippedAt"`
	SettledAt         string `json:"settledAt"`
	CancelledAt       string `json:"cancelledAt"`
	ReturnRequestedAt string `json:"returnRequestedAt"`
	ReturnCompletedAt string `json:"returnCompletedAt"`	
	
	// --- PRIVATE DATA VERIFICATION (Chống gian lận) ---
	SellerDataHash  string `json:"sellerDataHash"`
	ShipperDataHash string `json:"shipperDataHash"`
	TaxDataHash     string `json:"taxDataHash"`

	// --- AUDIT TRAIL ---
	History []HistoryEntry `json:"history"`
}

// HistoryEntry: Lưu vết nhanh
type HistoryEntry struct {
	TxID      string `json:"txID"`
	Timestamp string `json:"timestamp"`
	Action    string `json:"action"`
	ActorOrg  string `json:"actorOrg"`
	ActorID   string `json:"actorID"`
}

// ===================================================================================
// PRIVATE DATA STRUCTS
// ===================================================================================

// Seller
// Collection: collectionSellerMarketplace
type OrderPrivateSeller struct {
	OrderID                string  `json:"orderID"`
	CustomerID             string  `json:"customerID"`
	Items                  []Item  `json:"items"`
	SellerTaxCode          string  `json:"sellerTaxCode"`
	FinalPrice             float64 `json:"FinalPrice"`
	TotalAmount            float64 `json:"TotalAmount"`
	TaxAmount              float64 `json:"vatAmount"`
	SellerNetIncome        float64 `json:"sellerNetIncome,omitempty"`
	PlatformDiscountAmount float64 `json:"platformDiscountAmount,omitempty"`
	ShopDiscountAmount     float64 `json:"shopDiscountAmount,omitempty"`   
}

type Item struct {
	ProductID   string  `json:"productID"`
	VariantID   string  `json:"variantID"`
	ProductName string  `json:"productName"`
	UnitPrice   float64 `json:"unitPrice"`
	Quantity    int     `json:"quantity"`
}

// Shipper
// Collection: collectionShipperMarketplace
type OrderPrivateShipper struct {
	OrderID         string  `json:"orderID"`
	ShippingAddress string  `json:"shippingAddress"`
	Phone           string  `json:"phone"`
	CODAmount       float64 `json:"codAmount"`
	ShippingFee     float64 `json:"shippingFee"`
}

// TaxOrg
// Collection: collectionTaxMarketplace
type OrderPrivateTax struct {
	OrderID string `json:"orderID"`
	SellerID        string `json:"sellerID"`
	SellerCompanyID string `json:"sellerCompanyID"`

	SellerTaxCode   string  `json:"sellerTaxCode"`
	TaxableRevenue  float64 `json:"taxableRevenue"`  // Doanh thu tính thuế (VNĐ) - Base on Price
	VATAmount       float64 `json:"vatAmount"`       // Thuế GTGT phải nộp
	TransactionDate string  `json:"transactionDate"` // Ngày phát sinh doanh thu
	Note            string  `json:"note"`            // Ghi chú (VD: Auto-calculated 2026 Regs)
}

// FullPrivateData: Dùng khi Platform query — chứa tất cả PDC
type FullPrivateData struct {
	SellerData  *OrderPrivateSeller  `json:"sellerData,omitempty"`
	ShipperData *OrderPrivateShipper `json:"shipperData,omitempty"`
	TaxData     *OrderPrivateTax     `json:"taxData,omitempty"`
}

// Struct trả về cho hàm Query
type QueryResponse struct {
	PublicData   *Order      `json:"publicData"`
	PrivateData  interface{} `json:"privateData,omitempty"`
	DataVerified bool        `json:"dataVerified"`
}

// QueryResult dùng cho Rich Query
type QueryResult struct {
	Key    string `json:"Key"`
	Record *Order `json:"Record"`
}

// ===================================================================================
// ON-CHAIN CONFIGURATION
// ===================================================================================

// TaxConfig: Tax rate configuration, managed by TaxOrg
type TaxConfig struct {
	VATRate   float64 `json:"vatRate"`   // VAT rate as percentage (e.g. 10 = 10%)
	UpdatedBy string  `json:"updatedBy"` // MSP ID of updater
	UpdatedAt string  `json:"updatedAt"` // ISO timestamp
}

// BusinessConfig: Business rules, managed by Platform
type BusinessConfig struct {
	HoldPeriodMinutes  int    `json:"holdPeriodMinutes"`  // Hold period before payout (default: 5)
	ReturnWindowMinutes int   `json:"returnWindowMinutes"` // Return window after delivery (default: 5)
	UpdatedBy          string `json:"updatedBy"`
	UpdatedAt          string `json:"updatedAt"`
}



