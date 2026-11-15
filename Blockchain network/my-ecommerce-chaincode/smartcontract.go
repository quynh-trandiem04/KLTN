// my-ecommerce-chaincode/smartcontract.go
package main

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"math"
	"time"

	"github.com/hyperledger/fabric-contract-api-go/contractapi"
)

type SmartContract struct {
	contractapi.Contract
}

func calculateHash(data []byte) string {
	hash := sha256.Sum256(data)
	return hex.EncodeToString(hash[:])
}

func getActorOrg(ctx contractapi.TransactionContextInterface) (string, error) {
	mspID, err := ctx.GetClientIdentity().GetMSPID()
	if err != nil {
		return "", fmt.Errorf("cannot get MSP ID: %v", err)
	}
	return mspID, nil
}

func getCallerCompanyID(ctx contractapi.TransactionContextInterface) (string, error) {
	val, found, err := ctx.GetClientIdentity().GetAttributeValue("companyCode")
	if err != nil {
		return "", fmt.Errorf("cannot read companyCode attribute: %v", err)
	}
	if !found || val == "" {
		return "", nil
	}
	return val, nil
}

// Trả về string (RFC3339) thay vì time.Time
func getTimeNowString(ctx contractapi.TransactionContextInterface) (string, error) {
    transientMap, err := ctx.GetStub().GetTransient()
    if err == nil {
        if timeBytes, ok := transientMap["simulated_time"]; ok {
            simulatedTime, parseErr := time.Parse(time.RFC3339, string(timeBytes))
            if parseErr == nil {
				return simulatedTime.Format(time.RFC3339), nil
            }
        }
    }

	txTime, err := ctx.GetStub().GetTxTimestamp()
	if err != nil {
		return "", fmt.Errorf("cannot get transaction timestamp: %v", err)
	}
	return time.Unix(txTime.GetSeconds(), int64(txTime.GetNanos())).Format(time.RFC3339), nil
}

func addHistory(ctx contractapi.TransactionContextInterface, order *Order, action, actorOrg, actorID string) error {
	txTimeStr, err := getTimeNowString(ctx)
	if err != nil {
		return err
	}

	entry := HistoryEntry{
		TxID:      ctx.GetStub().GetTxID(),
		Timestamp: txTimeStr,
		Action:    action,
		ActorOrg:  actorOrg,
		ActorID:   actorID,
	}

	order.History = append(order.History, entry)
	return nil
}

func getOrderState(ctx contractapi.TransactionContextInterface, orderID string) (*Order, error) {
	bytes, err := ctx.GetStub().GetState(orderID)
	if err != nil {
		return nil, fmt.Errorf("ledger read error: %v", err)
	}
	if bytes == nil {
		return nil, fmt.Errorf("order %s does not exist", orderID)
	}

	var order Order
	if err := json.Unmarshal(bytes, &order); err != nil {
		return nil, fmt.Errorf("unmarshal error: %v", err)
	}
	return &order, nil
}

func saveOrderState(ctx contractapi.TransactionContextInterface, order *Order) error {
	bytes, err := json.Marshal(order)
	if err != nil {
		return err
	}
	return ctx.GetStub().PutState(order.OrderID, bytes)
}

func getTaxConfig(ctx contractapi.TransactionContextInterface) (*TaxConfig, error) {
	bytes, err := ctx.GetStub().GetState(KeyTaxConfig)
	if err != nil {
		return nil, fmt.Errorf("cannot read tax config: %v", err)
	}
	if bytes == nil {
		return &TaxConfig{VATRate: 10.0, UpdatedBy: "DEFAULT", UpdatedAt: ""}, nil
	}
	var config TaxConfig
	if err := json.Unmarshal(bytes, &config); err != nil {
		return nil, fmt.Errorf("unmarshal tax config error: %v", err)
	}
	return &config, nil
}

func getBusinessConfig(ctx contractapi.TransactionContextInterface) (*BusinessConfig, error) {
	bytes, err := ctx.GetStub().GetState(KeyBusinessConfig)
	if err != nil {
		return nil, fmt.Errorf("cannot read business config: %v", err)
	}
	if bytes == nil {
		return &BusinessConfig{HoldPeriodMinutes: 5, ReturnWindowMinutes: 5, UpdatedBy: "DEFAULT", UpdatedAt: ""}, nil
	}
	var config BusinessConfig
	if err := json.Unmarshal(bytes, &config); err != nil {
		return nil, fmt.Errorf("unmarshal business config error: %v", err)
	}
	return &config, nil
}

func (s *SmartContract) InitLedger(ctx contractapi.TransactionContextInterface) error {
	return nil
}

// -----------------------------------------------------------------------------------
// CreateOrder
// -----------------------------------------------------------------------------------
func (s *SmartContract) CreateOrder(ctx contractapi.TransactionContextInterface, orderID string) error {
	existing, err := ctx.GetStub().GetState(orderID)
	if err != nil { return err }
	if existing != nil { return fmt.Errorf("order %s already exists", orderID) }

	mspID, err := getActorOrg(ctx)
	if err != nil { return err }
	if mspID != "ECommercePlatformOrgMSP" { return fmt.Errorf("LỖI QUYỀN: Chỉ Sàn TMĐT mới được tạo đơn hàng") }

	transientMap, err := ctx.GetStub().GetTransient()
	if err != nil { return err }

    var paymentMethod, shipperCompanyID, sellerCompanyID, shipperID string
    
	if metaBytes, ok := transientMap["metadata"]; ok {
		var meta struct {
            PaymentMethod    string `json:"paymentMethod"`
			ShipperID        string `json:"shipperID"`        
			ShipperCompanyID string `json:"shipperCompanyID"` 
			SellerCompanyID  string `json:"sellerCompanyID"`  
		}
		_ = json.Unmarshal(metaBytes, &meta)
		paymentMethod = meta.PaymentMethod
        shipperID = meta.ShipperID
        shipperCompanyID = meta.ShipperCompanyID
        sellerCompanyID = meta.SellerCompanyID
    }

	if sellerCompanyID == "" { return fmt.Errorf("thiếu thông tin SellerCompanyID") }

    sellerBytes, ok := transientMap["seller_data"]
    if !ok { return fmt.Errorf("missing seller_data") }
    if err := ctx.GetStub().PutPrivateData(CollectionSellerMarketplace, orderID, sellerBytes); err != nil { return err }
    sellerHash := calculateHash(sellerBytes)

    shipperBytes, ok := transientMap["shipper_data"]
    if !ok { return fmt.Errorf("missing shipper_data") }
    if err := ctx.GetStub().PutPrivateData(CollectionShipperMarketplace, orderID, shipperBytes); err != nil { return err }
    shipperHash := calculateHash(shipperBytes)

	txTimeStr, err := getTimeNowString(ctx)
	if err != nil { return err }

	codStatus := ""
	if paymentMethod == PaymentCOD { codStatus = CodNotCollected }
	if shipperID == "" { shipperID = "ShipperOrgMSP" }
	
	order := Order{
		DocType:          DocTypeOrder,
		OrderID:          orderID,
		Status:           StatusCreated,
		PaymentMethod:    paymentMethod,
		CodStatus:        codStatus,
        
        SellerID:         "SellerOrgMSP", 
		SellerCompanyID:  sellerCompanyID,
        ShipperID:        shipperID,
		ShipperCompanyID: shipperCompanyID,

		VATRate:          0.0,

		CreatedAt:        txTimeStr,
		UpdatedAt:        txTimeStr,
		
		SellerDataHash:   sellerHash,
		ShipperDataHash:  shipperHash,
		History:          []HistoryEntry{},
	}

	addHistory(ctx, &order, "CreateOrder", mspID, "PlatformSystem")
	return saveOrderState(ctx, &order)
}

// -----------------------------------------------------------------------------------
// ConfirmPayment (Prepaid)
// -----------------------------------------------------------------------------------
func (s *SmartContract) ConfirmPayment(ctx contractapi.TransactionContextInterface, orderID string) error {
	order, err := getOrderState(ctx, orderID)
	if err != nil { return err }

	if order.PaymentMethod != PaymentPrepaid { return fmt.Errorf("chỉ đơn hàng PREPAID mới cần ConfirmPayment") }
	if order.Status != StatusCreated { return fmt.Errorf("đơn hàng phải ở trạng thái %s (hiện tại: %s)", StatusCreated, order.Status) }

	mspID, _ := getActorOrg(ctx)
	if mspID != "ECommercePlatformOrgMSP" { return fmt.Errorf("chỉ Sàn TMĐT mới được xác nhận thanh toán") }

	txTimeStr, _ := getTimeNowString(ctx)

	order.Status = StatusPaid
	order.UpdatedAt = txTimeStr
	order.PaidAt = txTimeStr
	
	addHistory(ctx, order, "ConfirmPayment", mspID, "PlatformAdmin")
	return saveOrderState(ctx, order)
}

// -----------------------------------------------------------------------------------
// ShipOrder
// -----------------------------------------------------------------------------------
func (s *SmartContract) ShipOrder(ctx contractapi.TransactionContextInterface, orderID string) error {
	order, err := getOrderState(ctx, orderID)
	if err != nil { return err }

	if order.PaymentMethod == PaymentCOD && order.Status != StatusCreated {
		return fmt.Errorf("đơn COD phải ở trạng thái %s (hiện tại: %s)", StatusCreated, order.Status)
	} else if order.PaymentMethod == PaymentPrepaid && order.Status != StatusPaid {
		return fmt.Errorf("đơn PREPAID phải ở trạng thái %s (hiện tại: %s)", StatusPaid, order.Status)
	}

	mspID, _ := getActorOrg(ctx)
	callerID, _ := getCallerCompanyID(ctx)

	if mspID != "ShipperOrgMSP" { return fmt.Errorf("chỉ ShipperOrg mới được thao tác") }
	if order.ShipperCompanyID != "" && order.ShipperCompanyID != callerID {
		return fmt.Errorf("đơn hàng được gán cho '%s', bạn là '%s'", order.ShipperCompanyID, callerID)
	}
	if order.ShipperCompanyID == "" { order.ShipperCompanyID = callerID }

	txTimeStr, _ := getTimeNowString(ctx)

	order.Status = StatusShipping
	order.UpdatedAt = txTimeStr
	order.ShippedAt = txTimeStr

	addHistory(ctx, order, "ShipOrder", mspID, callerID)
	return saveOrderState(ctx, order)
}

// -----------------------------------------------------------------------------------
// ConfirmDelivery (Prepaid)
// -----------------------------------------------------------------------------------
func (s *SmartContract) ConfirmDelivery(ctx contractapi.TransactionContextInterface, orderID string) error {
	order, err := getOrderState(ctx, orderID)
	if err != nil { return err }

	if order.PaymentMethod != PaymentPrepaid { return fmt.Errorf("hàm này chỉ dành cho đơn PREPAID") }
	if order.Status != StatusShipping { return fmt.Errorf("đơn hàng phải ở trạng thái %s (hiện tại: %s)", StatusShipping, order.Status) }

	mspID, _ := getActorOrg(ctx)
	callerID, _ := getCallerCompanyID(ctx)
	if mspID != "ShipperOrgMSP" || order.ShipperCompanyID != callerID { return fmt.Errorf("không có quyền xác nhận giao hàng") }

	txTimeStr, _ := getTimeNowString(ctx)

	order.Status = StatusDelivered
	order.DeliveryTimestamp = txTimeStr
	order.UpdatedAt = txTimeStr

	addHistory(ctx, order, "ConfirmDelivery", mspID, callerID)
	return saveOrderState(ctx, order)
}

// -----------------------------------------------------------------------------------
// ConfirmCODDelivery (COD)
// -----------------------------------------------------------------------------------
func (s *SmartContract) ConfirmCODDelivery(ctx contractapi.TransactionContextInterface, orderID string) error {
	order, err := getOrderState(ctx, orderID)
	if err != nil { return err }

	if order.PaymentMethod != PaymentCOD { return fmt.Errorf("hàm này chỉ dành cho đơn COD") }
	if order.Status != StatusShipping { return fmt.Errorf("đơn hàng phải ở trạng thái %s (hiện tại: %s)", StatusShipping, order.Status) }

	mspID, _ := getActorOrg(ctx)
	callerID, _ := getCallerCompanyID(ctx)
	if mspID != "ShipperOrgMSP" || order.ShipperCompanyID != callerID { return fmt.Errorf("không có quyền xác nhận giao hàng") }

	txTimeStr, _ := getTimeNowString(ctx)

	order.Status = StatusDelivered
	order.CodStatus = CodPendingRemittance 
	order.DeliveryTimestamp = txTimeStr
	order.UpdatedAt = txTimeStr

	addHistory(ctx, order, "ConfirmCODDelivery", mspID, callerID)
	return saveOrderState(ctx, order)
}

// -----------------------------------------------------------------------------------
// RemitCOD
// -----------------------------------------------------------------------------------
func (s *SmartContract) RemitCOD(ctx contractapi.TransactionContextInterface, orderID string) error {
	order, err := getOrderState(ctx, orderID)
	if err != nil { return err }

	if order.CodStatus != CodPendingRemittance { return fmt.Errorf("CodStatus phải là %s (hiện tại: %s)", CodPendingRemittance, order.CodStatus) }
	if order.Status != StatusDelivered { return fmt.Errorf("đơn hàng phải ở trạng thái %s (hiện tại: %s)", StatusDelivered, order.Status) }

	mspID, _ := getActorOrg(ctx)
	if mspID != "ECommercePlatformOrgMSP" { return fmt.Errorf("chỉ Sàn TMĐT mới được xác nhận đã nhận tiền COD") }

	txTimeStr, _ := getTimeNowString(ctx)

	order.CodStatus = CodRemitted
	order.UpdatedAt = txTimeStr
	
	addHistory(ctx, order, "RemitCOD", mspID, "PlatformAdmin")
	return saveOrderState(ctx, order)
}

// -----------------------------------------------------------------------------------
// PayoutToSeller (Settlement)
// -----------------------------------------------------------------------------------
func (s *SmartContract) PayoutToSeller(ctx contractapi.TransactionContextInterface, orderID string) error {
	order, err := getOrderState(ctx, orderID)
	if err != nil { return err }

	if order.Status != StatusDelivered { return fmt.Errorf("đơn hàng phải ở trạng thái %s (hiện tại: %s)", StatusDelivered, order.Status) }
	if order.PaymentMethod == PaymentCOD && order.CodStatus != CodRemitted { return fmt.Errorf("đơn COD phải nộp tiền (%s)", CodRemitted) }

	mspID, _ := getActorOrg(ctx)
	if mspID != "ECommercePlatformOrgMSP" { return fmt.Errorf("chỉ Sàn TMĐT mới được đối soát") }

	if order.DeliveryTimestamp == "" { return fmt.Errorf("lỗi dữ liệu: không có thời gian giao hàng") }

	bizConfig, err := getBusinessConfig(ctx)
	if err != nil { return err }

	deliveryTime, err := time.Parse(time.RFC3339, order.DeliveryTimestamp)
	if err != nil { return fmt.Errorf("lỗi format thời gian giao hàng: %v", err) }

	txTimeStr, _ := getTimeNowString(ctx)
	txTime, _ := time.Parse(time.RFC3339, txTimeStr)

	holdDuration := time.Duration(bizConfig.HoldPeriodMinutes) * time.Minute
	unlockTime := deliveryTime.Add(holdDuration)
	if txTime.Before(unlockTime) { return fmt.Errorf("chưa đủ thời gian giữ tiền. Mở khóa lúc: %v", unlockTime) }

	transientMap, err := ctx.GetStub().GetTransient()
	if err != nil { return err }

	sellerBytes, ok := transientMap["seller_settlement_data"]
	if !ok { return fmt.Errorf("thiếu dữ liệu đối soát seller") }
	var sellerCheck OrderPrivateSeller
	if err := json.Unmarshal(sellerBytes, &sellerCheck); err != nil { return fmt.Errorf("lỗi format: %v", err) }
	if err := ctx.GetStub().PutPrivateData(CollectionSellerMarketplace, orderID, sellerBytes); err != nil { return err }

	taxBytes, ok := transientMap["tax_data"]
	if !ok { return fmt.Errorf("thiếu dữ liệu thuế") }
	var taxCheck OrderPrivateTax
	if err := json.Unmarshal(taxBytes, &taxCheck); err != nil { return fmt.Errorf("lỗi format: %v", err) }

	taxConfig, err := getTaxConfig(ctx)
	if err != nil { return err }
	expectedVAT := taxCheck.TaxableRevenue * taxConfig.VATRate / 100.0
	diff := math.Abs(expectedVAT - taxCheck.VATAmount)
	if diff > 1.0 { return fmt.Errorf("thuế GTGT không khớp: tính được %.0f, nhận được %.0f", expectedVAT, taxCheck.VATAmount) }

	if err := ctx.GetStub().PutPrivateData(CollectionTaxMarketplace, orderID, taxBytes); err != nil { return err }

	order.Status = StatusSettled
	order.UpdatedAt = txTimeStr
	order.SettledAt = txTimeStr
	order.VATRate = taxConfig.VATRate
	order.SellerDataHash = calculateHash(sellerBytes)
	order.TaxDataHash = calculateHash(taxBytes)
	
	addHistory(ctx, order, "PayoutToSeller", mspID, "PlatformAdmin")
	return saveOrderState(ctx, order)
}

// -----------------------------------------------------------------------------------
// RequestReturn
// -----------------------------------------------------------------------------------
func (s *SmartContract) RequestReturn(ctx contractapi.TransactionContextInterface, orderID string) error {
	order, err := getOrderState(ctx, orderID)
	if err != nil { return err }

	if order.Status != StatusDelivered { return fmt.Errorf("chỉ có thể yêu cầu trả hàng ở trạng thái %s", StatusDelivered) }

	mspID, _ := getActorOrg(ctx)
	if mspID != "ECommercePlatformOrgMSP" { return fmt.Errorf("chỉ Sàn TMĐT được yêu cầu trả hàng") }
	if order.DeliveryTimestamp == "" { return fmt.Errorf("lỗi dữ liệu: chưa giao hàng") }

	bizConfig, err := getBusinessConfig(ctx)
	if err != nil { return err }

	deliveryTime, err := time.Parse(time.RFC3339, order.DeliveryTimestamp)
	if err != nil { return fmt.Errorf("lỗi format thời gian giao hàng") }

	txTimeStr, _ := getTimeNowString(ctx)
	txTime, _ := time.Parse(time.RFC3339, txTimeStr)

	returnWindow := time.Duration(bizConfig.ReturnWindowMinutes) * time.Minute
	deadline := deliveryTime.Add(returnWindow)
	if txTime.After(deadline) { return fmt.Errorf("đã quá hạn trả hàng (%d phút)", bizConfig.ReturnWindowMinutes) }

	order.Status = StatusReturnRequested
	order.UpdatedAt = txTimeStr
	order.ReturnRequestedAt = txTimeStr

	addHistory(ctx, order, "RequestReturn", mspID, "PlatformAdmin")
	return saveOrderState(ctx, order)
}

// -----------------------------------------------------------------------------------
// ShipReturn
// -----------------------------------------------------------------------------------
func (s *SmartContract) ShipReturn(ctx contractapi.TransactionContextInterface, orderID string) error {
	order, err := getOrderState(ctx, orderID)
	if err != nil { return err }

	if order.Status != StatusReturnRequested { return fmt.Errorf("đơn hàng phải ở trạng thái %s", StatusReturnRequested) }

	mspID, _ := getActorOrg(ctx)
	callerID, _ := getCallerCompanyID(ctx)

	if mspID != "ShipperOrgMSP" || order.ShipperCompanyID != callerID { return fmt.Errorf("không có quyền lấy hàng trả") }

	txTimeStr, _ := getTimeNowString(ctx)

	order.Status = StatusReturnInTransit
	order.UpdatedAt = txTimeStr

	addHistory(ctx, order, "ShipReturn", mspID, callerID)
	return saveOrderState(ctx, order)
}

// -----------------------------------------------------------------------------------
// ConfirmReturnReceived
// -----------------------------------------------------------------------------------
func (s *SmartContract) ConfirmReturnReceived(ctx contractapi.TransactionContextInterface, orderID string) error {
	order, err := getOrderState(ctx, orderID)
	if err != nil { return err }

	if order.Status != StatusReturnInTransit { return fmt.Errorf("đơn hàng phải ở trạng thái %s", StatusReturnInTransit) }

	mspID, _ := getActorOrg(ctx)
	callerID, _ := getCallerCompanyID(ctx)

	if mspID != "SellerOrgMSP" || order.SellerCompanyID != callerID { return fmt.Errorf("không có quyền xác nhận nhận hàng") }

	txTimeStr, _ := getTimeNowString(ctx)

	order.Status = StatusReturnedSuccess
	order.UpdatedAt = txTimeStr
	order.ReturnCompletedAt = txTimeStr

	addHistory(ctx, order, "ConfirmReturnReceived", mspID, callerID)
	return saveOrderState(ctx, order)
}

// -----------------------------------------------------------------------------------
// CancelOrder
// -----------------------------------------------------------------------------------
func (s *SmartContract) CancelOrder(ctx contractapi.TransactionContextInterface, orderID string) error {
	order, err := getOrderState(ctx, orderID)
	if err != nil { return err }

	if order.Status != StatusCreated && order.Status != StatusPaid {
		return fmt.Errorf("chỉ có thể hủy đơn khi ở trạng thái %s hoặc %s", StatusCreated, StatusPaid)
	}

	mspID, err := getActorOrg(ctx)
	if err != nil { return err }

	callerID, err := getCallerCompanyID(ctx)
	if err != nil { return err }

	isOwner := (mspID == order.SellerID && callerID == order.SellerCompanyID)
	isPlatform := (mspID == "ECommercePlatformOrgMSP")

	if !isOwner && !isPlatform { return fmt.Errorf("bạn không có quyền hủy đơn này") }

	txTimeStr, err := getTimeNowString(ctx)
	if err != nil { return err }

	order.Status = StatusCancelled
	order.UpdatedAt = txTimeStr
	order.CancelledAt = txTimeStr

	actorName := callerID
	if isPlatform {
		actorName = "PlatformSystem" 
	}

	addHistory(ctx, order, "CancelOrder", mspID, actorName)
	return saveOrderState(ctx, order)
}

// -----------------------------------------------------------------------------------
// Query & Config
// -----------------------------------------------------------------------------------
func (s *SmartContract) QueryOrder(ctx contractapi.TransactionContextInterface, orderID string) (*QueryResponse, error) {
	order, err := getOrderState(ctx, orderID)
	if err != nil { return nil, err }
	mspID, err := getActorOrg(ctx)
	if err != nil { return nil, err }
	
	response := &QueryResponse{PublicData: order, DataVerified: true}

	// Platform: trả về TẤT CẢ private data (cho lakehouse + admin dashboard)
	if mspID == "ECommercePlatformOrgMSP" {
		fullData := &FullPrivateData{}

		if bytes, err := ctx.GetStub().GetPrivateData(CollectionSellerMarketplace, orderID); err == nil && bytes != nil {
			if calculateHash(bytes) != order.SellerDataHash { response.DataVerified = false }
			var data OrderPrivateSeller
			_ = json.Unmarshal(bytes, &data)
			fullData.SellerData = &data
		}
		if bytes, err := ctx.GetStub().GetPrivateData(CollectionShipperMarketplace, orderID); err == nil && bytes != nil {
			if calculateHash(bytes) != order.ShipperDataHash { response.DataVerified = false }
			var data OrderPrivateShipper
			_ = json.Unmarshal(bytes, &data)
			fullData.ShipperData = &data
		}
		if bytes, err := ctx.GetStub().GetPrivateData(CollectionTaxMarketplace, orderID); err == nil && bytes != nil {
			if calculateHash(bytes) != order.TaxDataHash { response.DataVerified = false }
			var data OrderPrivateTax
			_ = json.Unmarshal(bytes, &data)
			fullData.TaxData = &data
		}

		response.PrivateData = fullData
	} else if mspID == "SellerOrgMSP" {
		if bytes, err := ctx.GetStub().GetPrivateData(CollectionSellerMarketplace, orderID); err == nil && bytes != nil {
			if calculateHash(bytes) != order.SellerDataHash { response.DataVerified = false }
			var data OrderPrivateSeller
			_ = json.Unmarshal(bytes, &data)
			response.PrivateData = data
		}
	} else if mspID == "ShipperOrgMSP" {
		if bytes, err := ctx.GetStub().GetPrivateData(CollectionShipperMarketplace, orderID); err == nil && bytes != nil {
			if calculateHash(bytes) != order.ShipperDataHash { response.DataVerified = false }
			var data OrderPrivateShipper
			_ = json.Unmarshal(bytes, &data)
			response.PrivateData = data
		}
	} else if mspID == "TaxOrgMSP" {
		if bytes, err := ctx.GetStub().GetPrivateData(CollectionTaxMarketplace, orderID); err == nil && bytes != nil {
			if calculateHash(bytes) != order.TaxDataHash { response.DataVerified = false }
			var data OrderPrivateTax
			_ = json.Unmarshal(bytes, &data)
			response.PrivateData = data
		}
	}

	return response, nil
}

func (s *SmartContract) QueryOrdersByString(ctx contractapi.TransactionContextInterface, queryString string) ([]*QueryResult, error) {
	resultsIterator, err := ctx.GetStub().GetQueryResult(queryString)
	if err != nil { return nil, fmt.Errorf("lỗi thực hiện Rich Query: %v", err) }
	defer resultsIterator.Close()

	var results []*QueryResult
	for resultsIterator.HasNext() {
		queryResponse, err := resultsIterator.Next()
		if err != nil { return nil, err }
		var order Order
		_ = json.Unmarshal(queryResponse.Value, &order)
		results = append(results, &QueryResult{Key: queryResponse.Key, Record: &order})
	}
	return results, nil
}

func (s *SmartContract) SetTaxConfig(ctx contractapi.TransactionContextInterface, configJSON string) error {
	mspID, _ := getActorOrg(ctx)
	if mspID != "TaxOrgMSP" && mspID != "ECommercePlatformOrgMSP" { return fmt.Errorf("không có quyền thay đổi thuế") }
	var config TaxConfig
	if err := json.Unmarshal([]byte(configJSON), &config); err != nil { return fmt.Errorf("lỗi format: %v", err) }
	txTimeStr, _ := getTimeNowString(ctx)
	config.UpdatedBy = mspID
	config.UpdatedAt = txTimeStr
	bytes, _ := json.Marshal(config)
	return ctx.GetStub().PutState(KeyTaxConfig, bytes)
}

func (s *SmartContract) SetBusinessConfig(ctx contractapi.TransactionContextInterface, configJSON string) error {
	mspID, _ := getActorOrg(ctx)
	if mspID != "ECommercePlatformOrgMSP" { return fmt.Errorf("không có quyền thay đổi cấu hình kinh doanh") }
	var config BusinessConfig
	if err := json.Unmarshal([]byte(configJSON), &config); err != nil { return fmt.Errorf("lỗi format: %v", err) }
	txTimeStr, _ := getTimeNowString(ctx)
	config.UpdatedBy = mspID
	config.UpdatedAt = txTimeStr
	bytes, _ := json.Marshal(config)
	return ctx.GetStub().PutState(KeyBusinessConfig, bytes)
}

func (s *SmartContract) GetTaxConfig(ctx contractapi.TransactionContextInterface) (*TaxConfig, error) {
	return getTaxConfig(ctx)
}

func (s *SmartContract) GetBusinessConfig(ctx contractapi.TransactionContextInterface) (*BusinessConfig, error) {
	return getBusinessConfig(ctx)
}
