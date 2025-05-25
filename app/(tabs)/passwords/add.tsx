import React, { useState } from 'react';
import { StyleSheet, Text, View, ScrollView, TextInput, TouchableOpacity, Alert } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { X } from 'lucide-react-native';
import { router } from 'expo-router';
import Colors from '@/constants/Colors';
import { PasswordCategory } from '@/types';
import { usePasswordManager } from '@/hooks/usePasswordManager';
import PasswordGenerator from '@/components/PasswordGenerator';

export default function AddPasswordScreen() {
  const { addPassword } = usePasswordManager();

  const [title, setTitle] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [website, setWebsite] = useState('');
  const [notes, setNotes] = useState('');
  const [category, setCategory] = useState<PasswordCategory>('other');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const categories: { label: string; value: PasswordCategory }[] = [
    { label: 'Social Media', value: 'social' },
    { label: 'Finance', value: 'finance' },
    { label: 'Email', value: 'email' },
    { label: 'Shopping', value: 'shopping' },
    { label: 'Entertainment', value: 'entertainment' },
    { label: 'Work', value: 'work' },
    { label: 'Other', value: 'other' },
  ];

  const validate = () => {
    const newErrors: Record<string, string> = {};
    
    if (!title.trim()) {
      newErrors.title = 'Title is required';
    }
    
    if (!username.trim()) {
      newErrors.username = 'Username is required';
    }
    
    if (!password.trim()) {
      newErrors.password = 'Password is required';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) {
      return;
    }
    
    const result = await addPassword({
      title,
      username,
      password,
      website: website || undefined,
      notes: notes || undefined,
      category,
    });
    
    if (result.success) {
      router.back();
    } else if (result.error === 'free_limit_reached') {
      Alert.alert(
        'Free Plan Limit Reached',
        'You have reached the maximum number of passwords for the free plan. Upgrade to Premium for unlimited passwords.',
        [
          { text: 'Cancel', style: 'cancel' },
          { 
            text: 'Upgrade', 
            onPress: () => {
              router.push('/modal/premium');
            } 
          },
        ]
      );
    } else {
      Alert.alert('Error', 'Failed to save password. Please try again.');
    }
  };

  const handleCancel = () => {
    router.back();
  };

  const handlePasswordGenerated = (generatedPassword: string) => {
    setPassword(generatedPassword);
  };

  return (
    <ScrollView style={styles.container} keyboardShouldPersistTaps="handled">
      <PasswordGenerator onPasswordGenerated={handlePasswordGenerated} />
      
      <View style={styles.formContainer}>
        <View style={styles.inputContainer}>
          <Text style={styles.label}>Title</Text>
          <TextInput
            style={[styles.input, errors.title ? styles.inputError : null]}
            placeholder="e.g., Gmail, Facebook, Bank"
            placeholderTextColor={Colors.gray}
            value={title}
            onChangeText={setTitle}
          />
          {errors.title ? <Text style={styles.errorText}>{errors.title}</Text> : null}
        </View>
        
        <View style={styles.inputContainer}>
          <Text style={styles.label}>Username / Email</Text>
          <TextInput
            style={[styles.input, errors.username ? styles.inputError : null]}
            placeholder="Enter username or email"
            placeholderTextColor={Colors.gray}
            value={username}
            onChangeText={setUsername}
            keyboardType="email-address"
            autoCapitalize="none"
          />
          {errors.username ? <Text style={styles.errorText}>{errors.username}</Text> : null}
        </View>
        
        <View style={styles.inputContainer}>
          <Text style={styles.label}>Password</Text>
          <TextInput
            style={[styles.input, errors.password ? styles.inputError : null]}
            placeholder="Enter password"
            placeholderTextColor={Colors.gray}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />
          {errors.password ? <Text style={styles.errorText}>{errors.password}</Text> : null}
        </View>
        
        <View style={styles.inputContainer}>
          <Text style={styles.label}>Website (optional)</Text>
          <TextInput
            style={styles.input}
            placeholder="https://example.com"
            placeholderTextColor={Colors.gray}
            value={website}
            onChangeText={setWebsite}
            keyboardType="url"
            autoCapitalize="none"
          />
        </View>
        
        <View style={styles.inputContainer}>
          <Text style={styles.label}>Category</Text>
          <View style={styles.pickerContainer}>
            <Picker
              selectedValue={category}
              onValueChange={(itemValue) => setCategory(itemValue as PasswordCategory)}
              style={styles.picker}
              dropdownIconColor={Colors.text}
            >
              {categories.map((cat) => (
                <Picker.Item 
                  key={cat.value} 
                  label={cat.label} 
                  value={cat.value} 
                  color={Colors.text}
                />
              ))}
            </Picker>
          </View>
        </View>
        
        <View style={styles.inputContainer}>
          <Text style={styles.label}>Notes (optional)</Text>
          <TextInput
            style={[styles.input, styles.notesInput]}
            placeholder="Add any additional information"
            placeholderTextColor={Colors.gray}
            value={notes}
            onChangeText={setNotes}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
          />
        </View>
      </View>
      
      <View style={styles.buttonContainer}>
        <TouchableOpacity style={styles.cancelButton} onPress={handleCancel}>
          <Text style={styles.cancelButtonText}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
          <Text style={styles.saveButtonText}>Save Password</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    padding: 16,
  },
  formContainer: {
    backgroundColor: Colors.cardBackground,
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  inputContainer: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginBottom: 8,
    fontFamily: 'PlusJakartaSans-Medium',
  },
  input: {
    backgroundColor: Colors.backgroundSecondary,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: Colors.text,
    borderWidth: 1,
    borderColor: Colors.border,
    fontFamily: 'PlusJakartaSans-Regular',
  },
  inputError: {
    borderColor: Colors.danger,
  },
  errorText: {
    color: Colors.danger,
    fontSize: 12,
    marginTop: 4,
    fontFamily: 'PlusJakartaSans-Regular',
  },
  notesInput: {
    minHeight: 100,
    textAlignVertical: 'top',
    paddingTop: 12,
  },
  pickerContainer: {
    backgroundColor: Colors.backgroundSecondary,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  picker: {
    color: Colors.text,
    backgroundColor: 'transparent',
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 40,
  },
  cancelButton: {
    flex: 1,
    backgroundColor: Colors.backgroundSecondary,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginRight: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cancelButtonText: {
    color: Colors.textSecondary,
    fontSize: 16,
    fontWeight: '600',
    fontFamily: 'PlusJakartaSans-SemiBold',
  },
  saveButton: {
    flex: 2,
    backgroundColor: Colors.primary,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginLeft: 8,
  },
  saveButtonText: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: '600',
    fontFamily: 'PlusJakartaSans-SemiBold',
  },
});