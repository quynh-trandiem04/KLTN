// backend-api/src/models/seller.models.js
const Joi = require('joi');

/**
 * Seller application validation schema
 */
const sellerApplicationSchema = Joi.object({
    email: Joi.string().email().max(255).lowercase().trim()
        .required()
        .messages({
            'string.email': 'Email không hợp lệ',
            'string.max': 'Email quá dài',
            'any.required': 'Email là bắt buộc'
        }),
    
    password: Joi.string().min(8).pattern(/^(?=.*\d)(?=.*[A-Z])/)
        .required()
        .messages({
            'string.min': 'Mật khẩu phải có ít nhất 8 ký tự',
            'string.pattern.base': 'Mật khẩu phải có ít nhất 1 số và 1 chữ in hoa',
            'any.required': 'Mật khẩu là bắt buộc'
        }),
    
    full_name: Joi.string().min(1).max(100).pattern(/^[a-zA-Z0-9À-ỹ\s]+$/)
        .required()
        .messages({
            'string.min': 'Họ tên không được để trống',
            'string.max': 'Họ tên không được quá 100 ký tự',
            'string.pattern.base': 'Họ tên chỉ được chứa chữ cái, số và khoảng trắng',
            'any.required': 'Họ tên là bắt buộc'
        }),
    
    phone_number: Joi.string().pattern(/^(0|\+84)[0-9]{9,10}$/).required()
        .messages({
            'string.pattern.base': 'Số điện thoại không hợp lệ (VD: 0912345678)',
            'any.required': 'Số điện thoại là bắt buộc cho người bán'
        }),
    
    business_name: Joi.string().min(3).max(255).required()
        .messages({
            'string.min': 'Tên cửa hàng phải có ít nhất 3 ký tự',
            'string.max': 'Tên cửa hàng quá dài',
            'any.required': 'Tên cửa hàng là bắt buộc'
        }),
    
    business_license: Joi.string().min(1).max(255).required()
        .messages({
            'string.min': 'Số giấy phép kinh doanh không được để trống',
            'string.max': 'Số giấy phép kinh doanh quá dài',
            'any.required': 'Số giấy phép kinh doanh là bắt buộc'
        }),
    
    business_address: Joi.string().min(10).max(500).required()
        .messages({
            'string.min': 'Địa chỉ kho hàng phải có ít nhất 10 ký tự',
            'string.max': 'Địa chỉ kho hàng quá dài',
            'any.required': 'Địa chỉ kho hàng là bắt buộc'
        }),
    
    tax_code: Joi.string().pattern(/^[0-9]{10,13}$/).required()
        .messages({
            'string.pattern.base': 'Mã số thuế không hợp lệ (10-13 số)',
            'any.required': 'Mã số thuế là bắt buộc'
        })
});

/**
 * Validation functions
 */
function validateSellerApplication(data) {
    return sellerApplicationSchema.validate(data, { abortEarly: false });
}

module.exports = {
    validateSellerApplication
};
