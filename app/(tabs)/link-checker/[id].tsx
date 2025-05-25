import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, Linking, ScrollView, Alert } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { ExternalLink, ShieldCheck, ShieldAlert, ShieldX, Clock, CircleCheck as CheckCircle, CircleAlert as AlertCircle, Circle as XCircle, Info } from 'lucide-react-native';
import Colors from '@/constants/Colors';
import { LinkCheckResult } from '@/types';
import { useLinkChecker } from '@/hooks/useLinkChecker';

export default function LinkCheckDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { getLinkCheckById } = useLinkChecker();
  
  const [linkCheck, setLinkCheck] = useState<LinkCheckResult | null>(null);

  useEffect(() => {
    if (id) {
      const result = getLinkCheckById(id);
      setLinkCheck(result);
    }
  }, [id]);

  const getStatusIcon = (status: LinkCheckResult['safeStatus']) => {
    switch (status) {
      case 'safe':
        return <ShieldCheck size={28} color={Colors.success} />;
      case 'suspicious':
        return <ShieldAlert size={28} color={Colors.warning} />;
      case 'dangerous':
        return <ShieldX size={28} color={Colors.danger} />;
      case 'checking':
        return <Clock size={28} color={Colors.primary} />;
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

  const getStatusTitle = (status: LinkCheckResult['safeStatus']) => {
    switch (status) {
      case 'safe':
        return 'Safe to Visit';
      case 'suspicious':
        return 'Potentially Suspicious';
      case 'dangerous':
        return 'Dangerous - Avoid';
      case 'checking':
        return 'Checking Link...';
    }
  };

  const getStatusDescription = (status: LinkCheckResult['safeStatus']) => {
    switch (status) {
      case 'safe':
        return 'This link appears to be safe based on our security checks. You can proceed with confidence.';
      case 'suspicious':
        return 'This link has some suspicious characteristics. Proceed with caution if you decide to visit.';
      case 'dangerous':
        return 'This link has been flagged as dangerous. It may contain malware, phishing, or other threats. We recommend not visiting this site.';
      case 'checking':
        return 'We are currently analyzing this link for potential security threats. Please wait...';
    }
  };

  const handleVisitSite = () => {
    if (!linkCheck) return;
    
    if (linkCheck.safeStatus === 'dangerous') {
      Alert.alert(
        'Dangerous Site Warning',
        'This site has been flagged as dangerous and may harm your device or steal your information. Are you sure you want to continue?',
        [
          { text: 'Cancel', style: 'cancel' },
          { 
            text: 'Visit Anyway', 
            style: 'destructive',
            onPress: () => Linking.openURL(linkCheck.url)
          },
        ]
      );
    } else if (linkCheck.safeStatus === 'suspicious') {
      Alert.alert(
        'Caution',
        'This site has some suspicious characteristics. Proceed with caution.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Visit Site', onPress: () => Linking.openURL(linkCheck.url) },
        ]
      );
    } else {
      Linking.openURL(linkCheck.url);
    }
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
  };

  if (!linkCheck) {
    return (
      <View style={styles.container}>
        <Text style={styles.notFoundText}>Link check not found</Text>
      </View>
    );
  }

  const StatusIndicator = () => (
    <View style={[styles.statusContainer, { borderColor: getStatusColor(linkCheck.safeStatus) }]}>
      {getStatusIcon(linkCheck.safeStatus)}
      <Text style={[styles.statusTitle, { color: getStatusColor(linkCheck.safeStatus) }]}>
        {getStatusTitle(linkCheck.safeStatus)}
      </Text>
      <Text style={styles.statusDescription}>
        {getStatusDescription(linkCheck.safeStatus)}
      </Text>
    </View>
  );

  return (
    <ScrollView style={styles.container}>
      <StatusIndicator />
      
      <View style={styles.urlContainer}>
        <Text style={styles.sectionTitle}>Link URL</Text>
        <Text style={styles.url}>{linkCheck.url}</Text>
        <Text style={styles.checkedAt}>Checked on {formatDate(linkCheck.checkedAt)}</Text>
        
        <TouchableOpacity 
          style={[
            styles.visitButton, 
            linkCheck.safeStatus === 'dangerous' && styles.visitButtonDangerous,
            linkCheck.safeStatus === 'suspicious' && styles.visitButtonWarning,
            linkCheck.safeStatus === 'checking' && styles.visitButtonDisabled,
          ]}
          onPress={handleVisitSite}
          disabled={linkCheck.safeStatus === 'checking'}
        >
          <Text style={styles.visitButtonText}>
            {linkCheck.safeStatus === 'checking' ? 'Analysis in Progress' : 'Visit Site'}
          </Text>
          {linkCheck.safeStatus !== 'checking' && <ExternalLink size={18} color={Colors.text} />}
        </TouchableOpacity>
      </View>
      
      {linkCheck.safeStatus !== 'checking' && linkCheck.details && (
        <View style={styles.detailsContainer}>
          <Text style={styles.sectionTitle}>Security Details</Text>
          
          <View style={styles.detailRow}>
            <View style={[
              styles.detailIcon, 
              { backgroundColor: linkCheck.details.hasHttps ? Colors.success + '20' : Colors.danger + '20' }
            ]}>
              {linkCheck.details.hasHttps ? (
                <CheckCircle size={18} color={Colors.success} />
              ) : (
                <XCircle size={18} color={Colors.danger} />
              )}
            </View>
            <View style={styles.detailContent}>
              <Text style={styles.detailTitle}>HTTPS Connection</Text>
              <Text style={styles.detailDescription}>
                {linkCheck.details.hasHttps 
                  ? 'This site uses secure HTTPS connection' 
                  : 'This site does not use secure HTTPS connection'}
              </Text>
            </View>
          </View>
          
          {linkCheck.details.domainAge !== undefined && (
            <View style={styles.detailRow}>
              <View style={[
                styles.detailIcon, 
                { backgroundColor: 
                  linkCheck.details.domainAge > 180 ? Colors.success + '20' : 
                  linkCheck.details.domainAge > 30 ? Colors.warning + '20' : 
                  Colors.danger + '20' 
                }
              ]}>
                <Info size={18} color={
                  linkCheck.details.domainAge > 180 ? Colors.success : 
                  linkCheck.details.domainAge > 30 ? Colors.warning : 
                  Colors.danger
                } />
              </View>
              <View style={styles.detailContent}>
                <Text style={styles.detailTitle}>Domain Age</Text>
                <Text style={styles.detailDescription}>
                  {linkCheck.details.domainAge > 365 
                    ? `This domain is over ${Math.floor(linkCheck.details.domainAge/365)} year(s) old` 
                    : linkCheck.details.domainAge > 30
                    ? `This domain is ${Math.floor(linkCheck.details.domainAge/30)} month(s) old`
                    : `This domain is only ${linkCheck.details.domainAge} days old`}
                </Text>
              </View>
            </View>
          )}
          
          {linkCheck.details.redirectCount !== undefined && (
            <View style={styles.detailRow}>
              <View style={[
                styles.detailIcon, 
                { backgroundColor: 
                  linkCheck.details.redirectCount === 0 ? Colors.success + '20' : 
                  linkCheck.details.redirectCount < 3 ? Colors.warning + '20' : 
                  Colors.danger + '20' 
                }
              ]}>
                {linkCheck.details.redirectCount === 0 ? (
                  <CheckCircle size={18} color={Colors.success} />
                ) : linkCheck.details.redirectCount < 3 ? (
                  <AlertCircle size={18} color={Colors.warning} />
                ) : (
                  <XCircle size={18} color={Colors.danger} />
                )}
              </View>
              <View style={styles.detailContent}>
                <Text style={styles.detailTitle}>Redirect Chain</Text>
                <Text style={styles.detailDescription}>
                  {linkCheck.details.redirectCount === 0 
                    ? 'No redirects detected' 
                    : `This link contains ${linkCheck.details.redirectCount} redirect(s)`}
                </Text>
              </View>
            </View>
          )}
          
          {linkCheck.details.threatType && (
            <View style={styles.detailRow}>
              <View style={[styles.detailIcon, { backgroundColor: Colors.danger + '20' }]}>
                <XCircle size={18} color={Colors.danger} />
              </View>
              <View style={styles.detailContent}>
                <Text style={styles.detailTitle}>Threat Detected</Text>
                <Text style={styles.detailDescription}>
                  {linkCheck.details.threatType === 'phishing' 
                    ? 'This site may be attempting to steal your personal information' 
                    : `Threat type: ${linkCheck.details.threatType}`}
                </Text>
              </View>
            </View>
          )}
        </View>
      )}
      
      <View style={styles.actionsContainer}>
        <TouchableOpacity style={styles.actionButton}>
          <Text style={styles.actionButtonText}>Check Again</Text>
        </TouchableOpacity>
        
        <TouchableOpacity style={[styles.actionButton, styles.actionButtonSecondary]}>
          <Text style={styles.actionButtonTextSecondary}>Report Incorrect Result</Text>
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
  statusContainer: {
    backgroundColor: Colors.cardBackground,
    borderRadius: 12,
    borderWidth: 2,
    padding: 20,
    alignItems: 'center',
    marginBottom: 20,
  },
  statusTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginTop: 12,
    marginBottom: 8,
    fontFamily: 'PlusJakartaSans-Bold',
  },
  statusDescription: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    fontFamily: 'PlusJakartaSans-Regular',
  },
  urlContainer: {
    backgroundColor: Colors.cardBackground,
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 12,
    fontFamily: 'PlusJakartaSans-SemiBold',
  },
  url: {
    fontSize: 14,
    color: Colors.text,
    backgroundColor: Colors.backgroundSecondary,
    padding: 12,
    borderRadius: 8,
    overflow: 'hidden',
    fontFamily: 'PlusJakartaSans-Regular',
  },
  checkedAt: {
    fontSize: 12,
    color: Colors.gray,
    marginTop: 8,
    marginBottom: 16,
    fontFamily: 'PlusJakartaSans-Regular',
  },
  visitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.success,
    paddingVertical: 12,
    borderRadius: 8,
  },
  visitButtonWarning: {
    backgroundColor: Colors.warning,
  },
  visitButtonDangerous: {
    backgroundColor: Colors.danger,
  },
  visitButtonDisabled: {
    backgroundColor: Colors.gray,
  },
  visitButtonText: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: '600',
    marginRight: 8,
    fontFamily: 'PlusJakartaSans-SemiBold',
  },
  detailsContainer: {
    backgroundColor: Colors.cardBackground,
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  detailRow: {
    flexDirection: 'row',
    marginBottom: 16,
    alignItems: 'flex-start',
  },
  detailIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    marginTop: 2,
  },
  detailContent: {
    flex: 1,
  },
  detailTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 4,
    fontFamily: 'PlusJakartaSans-SemiBold',
  },
  detailDescription: {
    fontSize: 14,
    color: Colors.textSecondary,
    lineHeight: 20,
    fontFamily: 'PlusJakartaSans-Regular',
  },
  actionsContainer: {
    marginBottom: 40,
  },
  actionButton: {
    backgroundColor: Colors.primary,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 12,
  },
  actionButtonText: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: '600',
    fontFamily: 'PlusJakartaSans-SemiBold',
  },
  actionButtonSecondary: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  actionButtonTextSecondary: {
    color: Colors.textSecondary,
    fontSize: 16,
    fontWeight: '600',
    fontFamily: 'PlusJakartaSans-SemiBold',
  },
  notFoundText: {
    fontSize: 18,
    color: Colors.text,
    textAlign: 'center',
    marginTop: 40,
    fontFamily: 'PlusJakartaSans-Medium',
  },
});