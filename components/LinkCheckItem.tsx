import React from 'react';
import { StyleSheet, Text, View, TouchableOpacity } from 'react-native';
import { ExternalLink, ShieldCheck, ShieldAlert, ShieldX, Clock } from 'lucide-react-native';
import Colors from '@/constants/Colors';
import { LinkCheckResult } from '@/types';
import { router } from 'expo-router';

interface LinkCheckItemProps {
  linkCheck: LinkCheckResult;
}

const getStatusIcon = (status: LinkCheckResult['safeStatus']) => {
  switch (status) {
    case 'safe':
      return <ShieldCheck size={20} color={Colors.success} />;
    case 'suspicious':
      return <ShieldAlert size={20} color={Colors.warning} />;
    case 'dangerous':
      return <ShieldX size={20} color={Colors.danger} />;
    case 'checking':
      return <Clock size={20} color={Colors.primary} />;
  }
};

const getStatusColor = (status: LinkCheckResult['safeStatus']) => {
  switch (status) {
    case 'safe':
      return Colors.success;
    case 'suspicious':
      return Colors.warning;
    case 'dangerous':
      return Colors.danger;
    case 'checking':
      return Colors.primary;
  }
};

const getStatusText = (status: LinkCheckResult['safeStatus']) => {
  switch (status) {
    case 'safe':
      return 'Safe';
    case 'suspicious':
      return 'Suspicious';
    case 'dangerous':
      return 'Dangerous';
    case 'checking':
      return 'Checking...';
  }
};

export default function LinkCheckItem({ linkCheck }: LinkCheckItemProps) {
  const handlePress = () => {
    router.push(`/link-checker/${linkCheck.id}`);
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
  };

  return (
    <TouchableOpacity
      style={styles.container}
      onPress={handlePress}
      activeOpacity={0.7}
    >
      <View style={[styles.iconContainer, { borderColor: getStatusColor(linkCheck.safeStatus) }]}>
        {getStatusIcon(linkCheck.safeStatus)}
      </View>
      <View style={styles.contentContainer}>
        <Text style={styles.url} numberOfLines={1}>
          {linkCheck.url}
        </Text>
        <View style={styles.statusRow}>
          <View style={[styles.statusBadge, { backgroundColor: getStatusColor(linkCheck.safeStatus) + '20', borderColor: getStatusColor(linkCheck.safeStatus) }]}>
            <Text style={[styles.statusText, { color: getStatusColor(linkCheck.safeStatus) }]}>
              {getStatusText(linkCheck.safeStatus)}
            </Text>
          </View>
          <Text style={styles.date}>{formatDate(linkCheck.checkedAt)}</Text>
        </View>
      </View>
      <TouchableOpacity style={styles.actionButton} onPress={handlePress}>
        <ExternalLink size={18} color={Colors.primary} />
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
    borderRadius: 20,
    backgroundColor: Colors.backgroundSecondary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
    borderWidth: 1,
  },
  contentContainer: {
    flex: 1,
  },
  url: {
    fontSize: 15,
    fontWeight: '500',
    color: Colors.text,
    marginBottom: 6,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    borderWidth: 1,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  date: {
    fontSize: 12,
    color: Colors.gray,
  },
  actionButton: {
    padding: 8,
  },
});