import React, { useState } from "react";
import { StyleSheet, View, Text, TextInput, Switch, TouchableOpacity } from "react-native";
import Colors from '@/constants/Colors';

interface PasswordGeneratorProps {
  onPasswordGenerated: (password: string) => void;
}

export default function PasswordGenerator({ onPasswordGenerated }: PasswordGeneratorProps) {
  const [length, setLength] = useState(16);
  const [includeUppercase, setIncludeUppercase] = useState(true);
  const [includeNumbers, setIncludeNumbers] = useState(true);
  const [includeSymbols, setIncludeSymbols] = useState(false);

  const generatePassword = () => {
    const lowercase = "abcdefghijklmnopqrstuvwxyz";
    const uppercase = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const numbers = "0123456789";
    const symbols = "!@#$%^&*()_+-=[]{}|;:',.<>?/";

    let charset = lowercase;
    if (includeUppercase) charset += uppercase;
    if (includeNumbers) charset += numbers;
    if (includeSymbols) charset += symbols;

    let generatedPassword = "";
    for (let i = 0; i < length; i++) {
      const randomIndex = Math.floor(Math.random() * charset.length);
      generatedPassword += charset[randomIndex];
    }

    onPasswordGenerated(generatedPassword);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Password Generator</Text>
      
      <View style={styles.lengthContainer}>
        <Text style={styles.label}>Password Length: {length}</Text>
        <TextInput
          style={styles.input}
          keyboardType="numeric"
          value={length.toString()}
          onChangeText={(text) => setLength(Number(text))}
        />
      </View>
      
      <View style={styles.optionsContainer}>
        <View style={styles.optionRow}>
          <Text style={styles.optionLabel}>Include Uppercase</Text>
          <Switch
            value={includeUppercase}
            onValueChange={setIncludeUppercase}
            trackColor={{ false: Colors.border, true: Colors.primary }}
            thumbColor={Colors.text}
          />
        </View>
        
        <View style={styles.optionRow}>
          <Text style={styles.optionLabel}>Include Numbers</Text>
          <Switch
            value={includeNumbers}
            onValueChange={setIncludeNumbers}
            trackColor={{ false: Colors.border, true: Colors.primary }}
            thumbColor={Colors.text}
          />
        </View>
        
        <View style={styles.optionRow}>
          <Text style={styles.optionLabel}>Include Symbols</Text>
          <Switch
            value={includeSymbols}
            onValueChange={setIncludeSymbols}
            trackColor={{ false: Colors.border, true: Colors.primary }}
            thumbColor={Colors.text}
          />
        </View>
      </View>
      
      <TouchableOpacity style={styles.generateButton} onPress={generatePassword}>
        <Text style={styles.generateButtonText}>Generate Password</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.cardBackground,
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 16,
    fontFamily: 'PlusJakartaSans-SemiBold',
  },
  lengthContainer: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginBottom: 8,
    fontFamily: 'PlusJakartaSans-Regular',
  },
  input: {
    backgroundColor: Colors.backgroundSecondary,
    borderRadius: 8,
    padding: 12,
    color: Colors.text,
    borderWidth: 1,
    borderColor: Colors.border,
    fontFamily: 'PlusJakartaSans-Regular',
  },
  optionsContainer: {
    marginBottom: 16,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  optionLabel: {
    fontSize: 14,
    color: Colors.text,
    fontFamily: 'PlusJakartaSans-Regular',
  },
  generateButton: {
    backgroundColor: Colors.primary,
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
  },
  generateButtonText: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: '600',
    fontFamily: 'PlusJakartaSans-SemiBold',
  },
});