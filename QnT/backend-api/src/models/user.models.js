// backend-api/src/models/user.models.js
const Joi = require('joi');

/**
 * User registration request validation schema
 */
const userRegisterSchema = Joi.object({
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
    
    phone_number: Joi.string().pattern(/^(0|\+84)[0-9]{9,10}$/).allow('', null)
        .messages({
            'string.pattern.base': 'Số điện thoại không hợp lệ (VD: 0912345678)'
        }),
    
    referred_by: Joi.number().integer().positive().allow(null).optional()
});

/**
 * Login request validation schema
 */
const loginSchema = Joi.object({
    email: Joi.string().email().lowercase().trim().required(),
    password: Joi.string().required()
});

/**
 * Validate user registration data
 */
function validateUserRegister(data) {
    return userRegisterSchema.validate(data, { abortEarly: false });
}

/**
 * Validate login data
 */
function validateLogin(data) {
    return loginSchema.validate(data, { abortEarly: false });
}

module.exports = {
    validateUserRegister,
    validateLogin,
    userRegisterSchema,
    loginSchema
};
