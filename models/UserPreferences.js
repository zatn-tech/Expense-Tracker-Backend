const mongoose = require('mongoose');

const userPreferencesSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  // Theme and Color Customization
  theme: {
    primaryColor: {
      type: String,
      default: '#4F46E5', // Indigo
      match: [/^#[0-9A-F]{6}$/i, 'Primary color must be a valid hex color']
    },
    secondaryColor: {
      type: String,
      default: '#7C3AED', // Purple
      match: [/^#[0-9A-F]{6}$/i, 'Secondary color must be a valid hex color']
    },
    accentColor: {
      type: String,
      default: '#10B981', // Emerald
      match: [/^#[0-9A-F]{6}$/i, 'Accent color must be a valid hex color']
    },
    backgroundColor: {
      type: String,
      default: '#FFFFFF', // White
      match: [/^#[0-9A-F]{6}$/i, 'Background color must be a valid hex color']
    },
    textColor: {
      type: String,
      default: '#111827', // Gray-900
      match: [/^#[0-9A-F]{6}$/i, 'Text color must be a valid hex color']
    },
    mode: {
      type: String,
      enum: ['light', 'dark', 'auto'],
      default: 'auto'
    }
  },

  // Typography Customization
  typography: {
    fontFamily: {
      type: String,
      enum: [
        // Modern Sans-Serif
        'Inter', 'Roboto', 'Open Sans', 'Lato', 'Montserrat', 'Poppins', 'Nunito', 'Source Sans Pro',
        
        // Elegant & Stylish
        'Playfair Display', 'Merriweather', 'Crimson Text', 'Libre Baskerville', 'Cormorant Garamond',
        
        // Tech & Futuristic
        'Orbitron', 'Exo 2', 'Rajdhani', 'Audiowide', 'Space Grotesk',
        
        // Creative & Artistic
        'Dancing Script', 'Pacifico', 'Lobster', 'Righteous', 'Fredoka One',
        
        // Monospace & Code
        'JetBrains Mono', 'Fira Code', 'Source Code Pro', 'IBM Plex Mono', 'Cascadia Code',
        
        // Handwriting & Casual
        'Caveat', 'Kalam', 'Comfortaa', 'Quicksand', 'Varela Round',
        
        // Professional & Business
        'IBM Plex Sans', 'Work Sans', 'DM Sans', 'Manrope', 'Plus Jakarta Sans'
      ],
      default: 'Inter'
    },
    fontSize: {
      type: String,
      enum: ['small', 'medium', 'large', 'extra-large'],
      default: 'medium'
    },
    fontWeight: {
      type: String,
      enum: ['light', 'normal', 'medium', 'semibold', 'bold'],
      default: 'normal'
    },
    lineHeight: {
      type: String,
      enum: ['tight', 'normal', 'relaxed'],
      default: 'normal'
    }
  },

  // Layout Customization
  layout: {
    sidebarWidth: {
      type: String,
      enum: ['narrow', 'normal', 'wide'],
      default: 'normal'
    },
    headerHeight: {
      type: String,
      enum: ['compact', 'normal', 'large'],
      default: 'normal'
    },
    borderRadius: {
      type: String,
      enum: ['none', 'small', 'medium', 'large'],
      default: 'medium'
    },
    spacing: {
      type: String,
      enum: ['compact', 'normal', 'comfortable'],
      default: 'normal'
    }
  },

  // Component Customization
  components: {
    buttonStyle: {
      type: String,
      enum: ['flat', 'raised', 'outlined', 'gradient'],
      default: 'raised'
    },
    cardStyle: {
      type: String,
      enum: ['flat', 'elevated', 'bordered', 'gradient'],
      default: 'elevated'
    },
    animationSpeed: {
      type: String,
      enum: ['slow', 'normal', 'fast', 'none'],
      default: 'normal'
    },
    showAnimations: {
      type: Boolean,
      default: true
    }
  },

  // Dashboard Customization
  dashboard: {
    layout: {
      type: String,
      enum: ['grid', 'list', 'compact'],
      default: 'grid'
    },
    widgets: [{
      name: String,
      position: Number,
      size: {
        type: String,
        enum: ['small', 'medium', 'large'],
        default: 'medium'
      },
      visible: {
        type: Boolean,
        default: true
      }
    }],
    defaultView: {
      type: String,
      enum: ['overview', 'transactions', 'budgets', 'goals'],
      default: 'overview'
    }
  },

  // Accessibility Settings
  accessibility: {
    highContrast: {
      type: Boolean,
      default: false
    },
    reducedMotion: {
      type: Boolean,
      default: false
    },
    screenReader: {
      type: Boolean,
      default: false
    },
    fontSize: {
      type: String,
      enum: ['small', 'medium', 'large', 'extra-large'],
      default: 'medium'
    }
  },

  // Export/Import Settings
  export: {
    defaultFormat: {
      type: String,
      enum: ['csv', 'excel', 'pdf', 'json'],
      default: 'csv'
    },
    includeHeaders: {
      type: Boolean,
      default: true
    }
  }

}, {
  timestamps: true
});

// Indexes
userPreferencesSchema.index({ userId: 1 }, { unique: true });

// Virtual for CSS custom properties
userPreferencesSchema.virtual('cssVariables').get(function() {
  return {
    '--primary-color': this.theme.primaryColor,
    '--secondary-color': this.theme.secondaryColor,
    '--accent-color': this.theme.accentColor,
    '--background-color': this.theme.backgroundColor,
    '--text-color': this.theme.textColor,
    '--font-family': this.typography.fontFamily,
    '--font-size': this.typography.fontSize,
    '--font-weight': this.typography.fontWeight,
    '--line-height': this.typography.lineHeight,
    '--border-radius': this.layout.borderRadius,
    '--spacing': this.layout.spacing,
    '--animation-speed': this.components.animationSpeed
  };
});

// Method to reset to defaults
userPreferencesSchema.methods.resetToDefaults = function() {
  this.theme = {
    primaryColor: '#4F46E5',
    secondaryColor: '#7C3AED',
    accentColor: '#10B981',
    backgroundColor: '#FFFFFF',
    textColor: '#111827',
    mode: 'auto'
  };
  
  this.typography = {
    fontFamily: 'Inter',
    fontSize: 'medium',
    fontWeight: 'normal',
    lineHeight: 'normal'
  };
  
  this.layout = {
    sidebarWidth: 'normal',
    headerHeight: 'normal',
    borderRadius: 'medium',
    spacing: 'normal'
  };
  
  this.components = {
    buttonStyle: 'raised',
    cardStyle: 'elevated',
    animationSpeed: 'normal',
    showAnimations: true
  };
  
  this.dashboard = {
    layout: 'grid',
    widgets: [],
    defaultView: 'overview'
  };
  
  this.accessibility = {
    highContrast: false,
    reducedMotion: false,
    screenReader: false,
    fontSize: 'medium'
  };
  
  this.export = {
    defaultFormat: 'csv',
    includeHeaders: true
  };
  
  return this.save();
};

module.exports = mongoose.model('UserPreferences', userPreferencesSchema);
