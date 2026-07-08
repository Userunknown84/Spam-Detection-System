const Joi = require('joi');

class PredictionValidator {
  /**
   * Schema for /predict endpoint
   */
  static predictSchema = Joi.object({
    message: Joi.string()
      .min(2)
      .max(10000)
      .required()
      .trim()
      .messages({
        'string.empty': 'Message cannot be empty',
        'string.min': 'Message must be at least 2 characters',
        'string.max': 'Message cannot exceed 10,000 characters',
        'any.required': 'Message is required'
      }),
    
    confidence_threshold: Joi.number()
      .min(0)
      .max(1)
      .default(0.5)
      .messages({
        'number.min': 'Confidence threshold must be at least 0',
        'number.max': 'Confidence threshold cannot exceed 1'
      })
  });

  /**
   * Schema for batch prediction
   */
  static batchPredictSchema = Joi.object({
    messages: Joi.array()
      .items(
        Joi.string()
          .min(2)
          .max(10000)
          .required()
          .trim()
      )
      .min(1)
      .max(100)
      .required()
      .messages({
        'array.min': 'At least one message is required',
        'array.max': 'Cannot process more than 100 messages at once',
        'array.required': 'Messages array is required',
        'array.base': 'Messages must be an array'
      })
  });

  /**
   * Schema for feedback endpoint
   */
  static feedbackSchema = Joi.object({
    prediction_id: Joi.string()
      .required()
      .pattern(/^[a-fA-F0-9]{24}$/)
      .messages({
        'string.pattern.base': 'Invalid prediction ID format',
        'any.required': 'Prediction ID is required'
      }),
    
    is_correct: Joi.boolean()
      .required()
      .messages({
        'any.required': 'is_correct is required',
        'boolean.base': 'is_correct must be true or false'
      }),
    
    feedback: Joi.string()
      .max(500)
      .optional()
      .trim()
      .messages({
        'string.max': 'Feedback cannot exceed 500 characters'
      })
  });

  /**
   * Schema for history query
   */
  static historySchema = Joi.object({
    page: Joi.number()
      .integer()
      .min(1)
      .default(1)
      .messages({
        'number.base': 'Page must be a number',
        'number.min': 'Page must be at least 1'
      }),
    
    limit: Joi.number()
      .integer()
      .min(1)
      .max(100)
      .default(20)
      .messages({
        'number.base': 'Limit must be a number',
        'number.min': 'Limit must be at least 1',
        'number.max': 'Limit cannot exceed 100'
      }),

    // Added basic query string validation to prevent massive payloads
    query: Joi.string()
      .max(5000)
      .optional()
      .allow('')
      .trim()
      .messages({
        'string.max': 'Query search string cannot exceed 5000 characters'
      }),
    
    sort_by: Joi.string()
      .valid('date', 'confidence', 'message')
      .default('date')
      .messages({
        'any.only': 'Sort by must be one of: date, confidence, message'
      }),
    
    sort_order: Joi.string()
      .valid('asc', 'desc')
      .default('desc')
      .messages({
        'any.only': 'Sort order must be asc or desc'
      }),
    
    start_date: Joi.date()
      .optional()
      .messages({
        'date.base': 'Invalid date format'
      }),
    
    end_date: Joi.date()
      .min(Joi.ref('start_date'))
      .optional()
      .messages({
        'date.base': 'Invalid date format',
        'date.min': 'End date must be after start date'
      })
  });

  /**
   * Schema for email header analysis
   */
  static emailHeaderSchema = Joi.object({
    headers: Joi.object()
      .required()
      .messages({
        'any.required': 'Email headers are required'
      }),
    
    email_content: Joi.string()
      .max(50000)
      .optional()
      .trim()
  });

  /**
   * Schema for URL verification
   */
  static urlSchema = Joi.object({
    urls: Joi.array()
      .items(
        Joi.string()
          .uri()
          .required()
          .messages({
            'string.uri': 'Invalid URL format'
          })
      )
      .min(1)
      .max(50)
      .required()
      .messages({
        'array.min': 'At least one URL is required',
        'array.max': 'Cannot process more than 50 URLs at once'
      })
  });
}

module.exports = PredictionValidator;