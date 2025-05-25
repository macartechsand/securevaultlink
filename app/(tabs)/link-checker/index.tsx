import React, { useState } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, FlatList, ActivityIndicator, Linking, Alert } from 'react-native';
import { Search, Link, Shield, History } from 'lucide-react-native';
import Colors from '@/constants/Colors';
import LinkCheckItem from '@/components/LinkCheckItem';
import { useLinkChecker } from '@/hooks/useLinkChecker';
import PremiumFeatureModal from '@/components/PremiumFeatureModal';

export default function LinkCheckerScreen() {
  const { linkChecks, loading, userPlan, checkLink } = useLinkChecker();
  const [url, setUrl] = useState('');
  const [urlError, setUrlError] = useState('');
  const [showPremiumModal, setShowPremiumModal] = useState(false);

  const validateUrl = (text: string) => {
    if (!text.trim()) {
      setUrlError('Please enter a URL');
      return false;
    }
    
    // Simple URL validation - could be more sophisticated in a real app
    if (!text.startsWith('http://') && !text.startsWith('https://')) {
      text = 'https://' + text;
      setUrl(text);
    }
    
    try {
      new URL(text);
      setUrlError('');
      return true;
    } catch (err) {
      setUrlError('Please enter a valid URL');
      return false;
    }
  };

  const handleCheckLink = async () => {
    if (!validateUrl(url)) {
      return;
    }
    
    // For premium users or if they have checks remaining
    const result = await checkLink(url);
    if (result.success) {
      setUrl('');
    }
  };

  const handleDemoUrl = () => {
    const demoUrls = [
      'https://example.com',
      'https://phishing-example.com',
      'https://suspicious-site.net'
    ];
    const randomUrl = demoUrls[Math.floor(Math.random() * demoUrls.length)];
    setUrl(randomUrl);
  };

  const handleInterceptLink = () => {
    if (userPlan === 'free') {
      setShowPremiumModal(true);
    } else {
      Alert.alert(
        'Link Protection Active',
        'The premium Link Protection feature is now active. Any links you click will be automatically scanned before opening.',
        [{ text: 'OK' }]
      );
    }
  };

  const renderEmptyList = () => {
    if (loading) return <ActivityIndicator size="large" color={Colors.primary} style={styles.loader} />;
    
    return (
      <View style={styles.emptyContainer}>
        <Shield size={48} color={Colors.gray} />
        <Text style={styles.emptyTitle}>No Link Checks Yet</Text>
        <Text style={styles.emptyText}>
          Enter a URL above to check if it's safe before visiting
        </Text>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>SafeLink Check</Text>
        <Text style={styles.description}>
          Verify the safety of any link before you visit it. We'll check for phishing attempts, malware, and other threats.
        </Text>
        
        <View style={styles.inputContainer}>
          <TextInput
            style={[styles.input, urlError ? styles.inputError : null]}
            placeholder="Enter a URL to check"
            placeholderTextColor={Colors.gray}
            value={url}
            onChangeText={(text) => {
              setUrl(text);
              if (urlError) setUrlError('');
            }}
            autoCapitalize="none"
            keyboardType="url"
          />
          <TouchableOpacity 
            style={styles.checkButton}
            onPress={handleCheckLink}
          >
            <Search size={20} color={Colors.text} />
          </TouchableOpacity>
        </View>
        
        {urlError ? <Text style={styles.errorText}>{urlError}</Text> : null}
        
        <View style={styles.demoContainer}>
          <TouchableOpacity onPress={handleDemoUrl}>
            <Text style={styles.demoLink}>Try a demo URL</Text>
          </TouchableOpacity>
        </View>
      </View>
      
      <TouchableOpacity 
        style={styles.interceptButton}
        onPress={handleInterceptLink}
      >
        <View style={styles.interceptButtonIcon}>
          <Link size={20} color={Colors.primary} />
        </View>
        <View style={styles.interceptButtonContent}>
          <Text style={styles.interceptButtonTitle}>Link Protection{userPlan === 'premium' ? ' (Active)' : ''}</Text>
          <Text style={styles.interceptButtonDescription}>
            {userPlan === 'premium' 
              ? 'All links you click will be automatically checked for safety.' 
              : 'Automatically check links before visiting them (Premium feature)'}
          </Text>
        </View>
        {userPlan === 'free' && (
          <View style={styles.premiumBadge}>
            <Text style={styles.premiumBadgeText}>PRO</Text>
          </View>
        )}
      </TouchableOpacity>
      
      <View style={styles.historyHeader}>
        <View style={styles.historyTitleContainer}>
          <History size={16} color={Colors.textSecondary} />
          <Text style={styles.historyTitle}>Recent Checks</Text>
        </View>
        {linkChecks.length > 0 && (
          <TouchableOpacity>
            <Text style={styles.clearHistoryText}>Clear All</Text>
          </TouchableOpacity>
        )}
      </View>
      
      <FlatList
        data={linkChecks}
        renderItem={({ item }) => <LinkCheckItem linkCheck={item} />}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={renderEmptyList}
      />
      
      <PremiumFeatureModal
        visible={showPremiumModal}
        onClose={() => setShowPremiumModal(false)}
        featureTitle="Automatic Link Protection"
        featureDescription="Get real-time protection from malicious links with our premium plan. We'll check every link before you visit it."
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    padding: 16,
  },
  card: {
    backgroundColor: Colors.cardBackground,
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 8,
    fontFamily: 'PlusJakartaSans-Bold',
  },
  description: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginBottom: 20,
    lineHeight: 20,
    fontFamily: 'PlusJakartaSans-Regular',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  input: {
    flex: 1,
    backgroundColor: Colors.backgroundSecondary,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    color: Colors.text,
    borderWidth: 1,
    borderColor: Colors.border,
    fontFamily: 'PlusJakartaSans-Regular',
  },
  inputError: {
    borderColor: Colors.danger,
  },
  checkButton: {
    backgroundColor: Colors.primary,
    borderRadius: 8,
    width: 48,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 12,
  },
  errorText: {
    color: Colors.danger,
    fontSize: 14,
    marginTop: 8,
    fontFamily: 'PlusJakartaSans-Regular',
  },
  demoContainer: {
    alignItems: 'center',
    marginTop: 16,
  },
  demoLink: {
    color: Colors.primary,
    fontSize: 14,
    fontFamily: 'PlusJakartaSans-Medium',
  },
  interceptButton: {
    flexDirection: 'row',
    backgroundColor: Colors.backgroundSecondary,
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  interceptButtonIcon: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: Colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  interceptButtonContent: {
    flex: 1,
  },
  interceptButtonTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 4,
    fontFamily: 'PlusJakartaSans-SemiBold',
  },
  interceptButtonDescription: {
    fontSize: 14,
    color: Colors.textSecondary,
    fontFamily: 'PlusJakartaSans-Regular',
  },
  premiumBadge: {
    backgroundColor: Colors.warning,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  premiumBadgeText: {
    color: Colors.background,
    fontSize: 12,
    fontWeight: '700',
    fontFamily: 'PlusJakartaSans-Bold',
  },
  historyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  historyTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  historyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
    marginLeft: 8,
    fontFamily: 'PlusJakartaSans-SemiBold',
  },
  clearHistoryText: {
    fontSize: 14,
    color: Colors.primary,
    fontFamily: 'PlusJakartaSans-Medium',
  },
  list: {
    flexGrow: 1,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    marginTop: 40,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.text,
    marginTop: 16,
    marginBottom: 8,
    fontFamily: 'PlusJakartaSans-SemiBold',
  },
  emptyText: {
    fontSize: 16,
    color: Colors.textSecondary,
    textAlign: 'center',
    fontFamily: 'PlusJakartaSans-Regular',
  },
  loader: {
    marginTop: 40,
  },
});