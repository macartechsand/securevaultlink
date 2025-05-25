import React from 'react';
import { StyleSheet, Text, View, TouchableOpacity } from 'react-native';
import { Eye, Star, CreditCard, Mail, ShoppingBag, Briefcase, Globe, Monitor, User } from 'lucide-react-native';
import Colors from '@/constants/Colors';
import { Password, PasswordCategory } from '@/types';
import { router } from 'expo-router';

interface PasswordItemProps {
  password: Password;
  showOptions?: () => void;
}

const getCategoryIcon = (category: PasswordCategory) => {
  switch (category) {
    case 'social':
      return <User size={20} color={Colors.success} />;
    case 'finance':
      return <CreditCard size={20} color={Colors.warning} />;
    case 'email':
      return <Mail size={20} color={Colors.primary} />;
    case 'shopping':
      return <ShoppingBag size={20} color={Colors.accent} />;
    case 'work':
      return <Briefcase size={20} color={Colors.secondary} />;
    case 'entertainment':
      return <Monitor size={20} color={Colors.success} />;
    default:
      return <Globe size={20} color={Colors.gray} />;
  }
};

export default function PasswordItem({ password, showOptions }: PasswordItemProps) {
  const handlePress = () => {
    router.push(`/passwords/${password.id}`);
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString();
  };

  return (
    <TouchableOpacity
      style={styles.container}
      onPress={handlePress}
      onLongPress={showOptions}
      activeOpacity={0.7}
    >
      <View style={styles.iconContainer}>
        {getCategoryIcon(password.category)}
      </View>
      <View style={styles.contentContainer}>
        <View style={styles.titleRow}>
          <Text style={styles.title} numberOfLines={1}>
            {password.title}
          </Text>
          {password.favorite && <Star size={16} color={Colors.warning} fill={Colors.warning} />}
        </View>
        <Text style={styles.username} numberOfLines={1}>
          {password.username}
        </Text>
        <Text style={styles.date}>Updated: {formatDate(password.updatedAt)}</Text>
      </View>
      <TouchableOpacity style={styles.viewButton} onPress={handlePress}>
        <Eye size={20} color={Colors.primary} />
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: Colors.cardBackground,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: Colors.backgroundSecondary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  contentContainer: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginRight: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 4,
    flex: 1,
  },
  username: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginBottom: 4,
  },
  date: {
    fontSize: 12,
    color: Colors.gray,
  },
  viewButton: {
    padding: 8,
  },
});