// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () => ({
  setItem: jest.fn(),
  getItem: jest.fn(),
  removeItem: jest.fn()
}));

// Mock expo-crypto
jest.mock('expo-crypto', () => {
  const mockDigestMap = new Map();

  return {
    digestStringAsync: jest.fn().mockImplementation((_, input) => {
      if (!mockDigestMap.has(input)) {
        mockDigestMap.set(input, `mocked-hash-${input}`);
      }
      return Promise.resolve(mockDigestMap.get(input));
    }),
    CryptoDigestAlgorithm: {
      SHA256: 'SHA-256'
    },
    CryptoEncoding: {
      BASE64: 'base64'
    },
    getRandomBytes: jest.fn().mockImplementation((size) => {
      const bytes = new Uint8Array(size);
      for (let i = 0; i < size; i++) {
        bytes[i] = Math.floor(Math.random() * 256);
      }
      return Promise.resolve(bytes);
    })
  };
});

// Mock expo-local-authentication
jest.mock('expo-local-authentication', () => ({
  hasHardwareAsync: jest.fn(),
  isEnrolledAsync: jest.fn(),
  authenticateAsync: jest.fn()
}));

// Mock crypto-js
jest.mock('crypto-js', () => {
  return {
    AES: {
      encrypt: jest.fn().mockImplementation((data, key) => {
        return {
          toString: () => `encrypted-${data}-${key}-${Date.now()}`
        };
      }),
      decrypt: jest.fn().mockImplementation((data, key) => ({
        toString: (encoder) => {
          if (key.includes('senha_errada')) {
            throw new Error('Falha ao descriptografar dados');
          }
          return 'decrypted-data';
        }
      }))
    },
    enc: {
      Utf8: {
        stringify: jest.fn().mockReturnValue('decrypted-data')
      }
    }
  };
});

// Mock zxcvbn with different scores for weak and strong passwords
jest.mock('zxcvbn', () => {
  return jest.fn().mockImplementation((password) => {
    if (password === 'password123') {
      return {
        score: 2,
        feedback: {
          warning: 'This is a common password',
          suggestions: ['Add another word or two']
        },
        crack_times_seconds: {
          online_no_throttling_10_per_second: 100
        },
        crack_times_display: {
          online_no_throttling_10_per_second: '1 minute'
        }
      };
    }
    return {
      score: 4,
      feedback: {
        warning: '',
        suggestions: []
      },
      crack_times_seconds: {
        online_no_throttling_10_per_second: 1000
      },
      crack_times_display: {
        online_no_throttling_10_per_second: '10 minutes'
      }
    };
  });
});

// Mock react-native
jest.mock('react-native', () => ({
  Alert: {
    alert: jest.fn()
  },
  Platform: {
    select: jest.fn()
  },
  NativeModules: {
    UIManager: {
      RCTView: () => ({})
    },
    RNGestureHandlerModule: {
      attachGestureHandler: jest.fn(),
      createGestureHandler: jest.fn(),
      dropGestureHandler: jest.fn(),
      updateGestureHandler: jest.fn(),
      State: {},
      Directions: {}
    }
  }
}));

// Silence the warning: Animated: `useNativeDriver` is not supported
jest.mock('react-native/Libraries/Animated/NativeAnimatedHelper');

// Mock console.error to avoid React Navigation warnings
const originalConsoleError = console.error;
console.error = (...args) => {
  if (args[0].includes('Please report: Excessive number of pending callbacks')) {
    return;
  }
  if (args[0].includes('Please report: Error with Event System')) {
    return;
  }
  originalConsoleError.apply(console, args);
}; 