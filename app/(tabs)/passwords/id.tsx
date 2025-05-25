import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView, Alert, TextInput } from 'react-native';
import { useLocalSearchParams, router, Stack } from 'expo-router';
import { Eye, EyeOff, Copy, Trash, CreditCard as Edit, Star, Save } from 'lucide-react-native';
import Colors from '@/constants/Colors';
import { usePasswordManager } from '@/hooks/usePasswordManager';
import { Password } from '@/types';

export default function PasswordDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { getPasswordById, deletePassword, updatePassword, toggleFavorite } = usePasswordManager();
  
  const [password, setPassword] = useState<Password | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editedPassword, setEditedPassword] = useState<Partial<Password>>({});

  useEffect(() => {
    if (id) {
      const foundPassword = getPasswordById(id);
      setPassword(foundPassword);
      setEditedPassword(foundPassword || {});
    }
  }, [id]);

  const handleCopy = (text: string, field: string) => {
    // On web, we can use the clipboard API
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(text);
      Alert.alert(`${field} copied to clipboard`);
    }
  };

  const handleDelete = () => {
    Alert.alert(
      'Delete Password',
      'Are you sure you want to delete this password? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Delete', 
          style: 'destructive',
          onPress: async () => {
            if (id) {
              const result = await deletePassword(id);
              if (result.success) {
                router.back();
              } else {
                Alert.alert('Error', 'Failed to delete password');
              }
            }
          }
        },
      ]
    );
  };

  const handleToggleFavorite = async () => {
    if (id && password) {
      const result = await toggleFavorite(id);
      if (result.success && result.password) {
        setPassword(result.password);
      }
    }
  };

  const handleSaveChanges = async () => {
    if (id && Object.keys(editedPassword).length > 0) {
      const result = await updatePassword(id, editedPassword);
      if (result.success && result.password) {
        setPassword(result.password);
        setIsEditing(false);
      } else {
        Alert.alert('Error', 'Failed to update password');
      }
    }
  };

  const handleEditField = (field: keyof Password, value: string) => {
    setEditedPassword(prev => ({
      ...prev,
      [field]: value
    }));
  };

  if (!password) {
    return (
      <View style={styles.container}>
        <Text style={styles.notFoundText}>Password not found</Text>
      </View>
    );
  }

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
  };

  return (
    <ScrollView style={styles.container}>
      <Stack.Screen 
        options={{
          headerRight: () => (
            <View style={styles.headerButtons}>
              {isEditing ? (
                <TouchableOpacity style={styles.headerButton} onPress={handleSaveChanges}>
                  <Save size={22} color={Colors.primary} />
                </TouchableOpacity>
              ) : (
                <>
                  <TouchableOpacity style={styles.headerButton} onPress={() => setIsEditing(true)}>
                    <Edit size={22} color={Colors.primary} />
                  </TouchableOpacity>
                  <TouchableOpacity 
                    style={styles.headerButton} 
                    onPress={handleToggleFavorite}
                  >
                    <Star 
                      size={22} 
                      color={password.favorite ? Colors.warning : Colors.gray} 
                      fill={password.favorite ? Colors.warning : 'transparent'} 
                    />
                  </TouchableOpacity>
                </>
              )}
            </View>
          ),
        }}
      />

      <View style={styles.card}>
        {isEditing ? (
          <View style={styles.fieldContainer}>
            <Text style={styles.fieldLabel}>Title</Text>
            <TextInput
              style={styles.input}
              value={editedPassword.title || ''}
              onChangeText={(text) => handleEditField('title', text)}
              placeholder="Title"
              placeholderTextColor={Colors.gray}
            />
          </View>
        ) : (
          <Text style={styles.title}>{password.title}</Text>
        )}

        <View style={styles.fieldContainer}>
          <Text style={styles.fieldLabel}>Username/Email</Text>
          
          {isEditing ? (
            <TextInput
              style={styles.input}
              value={editedPassword.username || ''}
              onChangeText={(text) => handleEditField('username', text)}
              placeholder="Username or Email"
              placeholderTextColor={Colors.gray}
            />
          ) : (
            <View style={styles.fieldValueContainer}>
              <Text style={styles.fieldValue}>{password.username}</Text>
              <TouchableOpacity 
                style={styles.copyButton}
                onPress={() => handleCopy(password.username, 'Username')}
              >
                <Copy size={16} color={Colors.primary} />
              </TouchableOpacity>
            </View>
          )}
        </View>

        <View style={styles.fieldContainer}>
          <Text style={styles.fieldLabel}>Password</Text>
          
          {isEditing ? (
            <TextInput
              style={styles.input}
              value={editedPassword.password || ''}
              onChangeText={(text) => handleEditField('password', text)}
              placeholder="Password"
              placeholderTextColor={Colors.gray}
              secureTextEntry={!showPassword}
            />
          ) : (
            <View style={styles.fieldValueContainer}>
              <Text style={styles.fieldValue}>
                {showPassword ? password.password : '•'.repeat(Math.min(12, password.password.length))}
              </Text>
              <View style={styles.passwordActions}>
                <TouchableOpacity 
                  style={styles.visibilityButton}
                  onPress={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? (
                    <EyeOff size={16} color={Colors.gray} />
                  ) : (
                    <Eye size={16} color={Colors.gray} />
                  )}
                </TouchableOpacity>
                <TouchableOpacity 
                  style={styles.copyButton}
                  onPress={() => handleCopy(password.password, 'Password')}
                >
                  <Copy size={16} color={Colors.primary} />
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>

        {(password.website || isEditing) && (
          <View style={styles.fieldContainer}>
            <Text style={styles.fieldLabel}>Website</Text>
            
            {isEditing ? (
              <TextInput
                style={styles.input}
                value={editedPassword.website || ''}
                onChangeText={(text) => handleEditField('website', text)}
                placeholder="Website URL"
                placeholderTextColor={Colors.gray}
              />
            ) : (
              <View style={styles.fieldValueContainer}>
                <Text style={styles.fieldValue}>{password.website}</Text>
                {password.website && (
                  <TouchableOpacity 
                    style={styles.copyButton}
                    onPress={() => handleCopy(password.website || '', 'Website')}
                  >
                    <Copy size={16} color={Colors.primary} />
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>
        )}

        {(password.notes || isEditing) && (
          <View style={styles.fieldContainer}>
            <Text style={styles.fieldLabel}>Notes</Text>
            
            {isEditing ? (
              <TextInput
                style={[styles.input, styles.notesInput]}
                value={editedPassword.notes || ''}
                onChangeText={(text) => handleEditField('notes', text)}
                placeholder="Additional notes"
                placeholderTextColor={Colors.gray}
                multiline
              />
            ) : (
              <Text style={styles.notesText}>{password.notes}</Text>
            )}
          </View>
        )}

        <View style={styles.metadataContainer}>
          <Text style={styles.metadataLabel}>Created:</Text>
          <Text style={styles.metadataValue}>{formatDate(password.createdAt)}</Text>
        </View>
        
        <View style={styles.metadataContainer}>
          <Text style={styles.metadataLabel}>Last Updated:</Text>
          <Text style={styles.metadataValue}>{formatDate(password.updatedAt)}</Text>
        </View>
      </View>

      {!isEditing && (
        <TouchableOpacity style={styles.deleteButton} onPress={handleDelete}>
          <Trash size={20} color={Colors.text} />
          <Text style={styles.deleteButtonText}>Delete Password</Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    padding: 16,
  },
  headerButtons: {
    flexDirection: 'row',
  },
  headerButton: {
    marginLeft: 16,
  },
  card: {
    backgroundColor: Colors.cardBackground,
    borderRadius: 12,
    padding: 20,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 20,
    fontFamily: 'PlusJakartaSans-Bold',
  },
  fieldContainer: {
    marginBottom: 20,
  },
  fieldLabel: {
    fontSize: 14,
    color: Colors.gray,
    marginBottom: 8,
    fontFamily: 'PlusJakartaSans-Medium',
  },
  fieldValueContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  fieldValue: {
    fontSize: 16,
    color: Colors.text,
    flex: 1,
    fontFamily: 'PlusJakartaSans-Regular',
  },
  passwordActions: {
    flexDirection: 'row',
  },
  copyButton: {
    padding: 8,
  },
  visibilityButton: {
    padding: 8,
    marginRight: 4,
  },
  notesText: {
    fontSize: 16,
    color: Colors.text,
    fontFamily: 'PlusJakartaSans-Regular',
  },
  metadataContainer: {
    flexDirection: 'row',
    marginTop: 4,
  },
  metadataLabel: {
    fontSize: 14,
    color: Colors.gray,
    marginRight: 8,
    fontFamily: 'PlusJakartaSans-Regular',
  },
  metadataValue: {
    fontSize: 14,
    color: Colors.textSecondary,
    fontFamily: 'PlusJakartaSans-Regular',
  },
  deleteButton: {
    backgroundColor: Colors.danger,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 8,
    marginBottom: 40,
  },
  deleteButtonText: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
    fontFamily: 'PlusJakartaSans-SemiBold',
  },
  notFoundText: {
    fontSize: 18,
    color: Colors.text,
    textAlign: 'center',
    marginTop: 40,
    fontFamily: 'PlusJakartaSans-Medium',
  },
  input: {
    backgroundColor: Colors.backgroundSecondary,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: Colors.text,
    borderWidth: 1,
    borderColor: Colors.border,
    fontFamily: 'PlusJakartaSans-Regular',
  },
  notesInput: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
});