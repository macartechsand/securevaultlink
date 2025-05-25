import React from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView, Platform } from 'react-native';
import { Crown, CircleCheck as CheckCircle, ArrowLeft, ShieldCheck, Key, Zap, LifeBuoy } from 'lucide-react-native';
import { Stack, router } from 'expo-router';
import Colors from '@/constants/Colors';
import { usePasswordManager } from '@/hooks/usePasswordManager';

export default function PremiumScreen() {
  const { userPlan, upgradeUserPlan } = usePasswordManager();

  const handleUpgrade = async () => {
    // In a real app, this would integrate with a payment API
    // For demo purposes, we'll just set the user to premium
    const result = await upgradeUserPlan();
    if (result.success) {
      router.back();
    }
  };

  const PremiumFeature = ({ icon, title, description }: { 
    icon: React.ReactNode, 
    title: string, 
    description: string 
  }) => (
    <View style={styles.featureItem}>
      <View style={styles.featureIcon}>
        {icon}
      </View>
      <View style={styles.featureContent}>
        <Text style={styles.featureTitle}>{title}</Text>
        <Text style={styles.featureDescription}>{description}</Text>
      </View>
      <CheckCircle size={20} color={Colors.success} />
    </View>
  );

  return (
    <View style={styles.container}>
      <Stack.Screen 
        options={{
          headerLeft: () => (
            <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
              <ArrowLeft size={24} color={Colors.text} />
            </TouchableOpacity>
          ),
        }}
      />
      
      <ScrollView style={styles.scrollView}>
        <View style={styles.headerContainer}>
          <View style={styles.crownContainer}>
            <Crown size={32} color={Colors.warning} fill={Colors.warning} />
          </View>
          <Text style={styles.title}>SecureLink Vault Premium</Text>
          <Text style={styles.subtitle}>
            Upgrade to unlock premium features and enhance your digital security
          </Text>
        </View>
        
        <View style={styles.pricingContainer}>
          <View style={styles.priceRow}>
            <Text style={styles.currency}>$</Text>
            <Text style={styles.price}>4.99</Text>
            <View style={styles.periodContainer}>
              <Text style={styles.periodText}>per month</Text>
              <View style={styles.saveBadge}>
                <Text style={styles.saveText}>Save 50%</Text>
              </View>
            </View>
          </View>
          <Text style={styles.annualPrice}>or $29.99 per year</Text>
          
          <TouchableOpacity 
            style={styles.upgradeButton}
            onPress={handleUpgrade}
          >
            <Text style={styles.upgradeButtonText}>
              {userPlan === 'premium' ? 'Already Subscribed' : 'Upgrade Now'}
            </Text>
          </TouchableOpacity>
          
          <Text style={styles.guaranteeText}>7-day money-back guarantee</Text>
        </View>
        
        <View style={styles.featuresContainer}>
          <Text style={styles.featuresTitle}>Premium Features</Text>
          
          <PremiumFeature 
            icon={<Key size={22} color={Colors.primary} />}
            title="Unlimited Password Storage"
            description="Store all your passwords without any limits."
          />
          
          <PremiumFeature 
            icon={<ShieldCheck size={22} color={Colors.primary} />}
            title="Automatic Link Protection"
            description="Real-time checking of links before you visit them."
          />
          
          <PremiumFeature 
            icon={<Zap size={22} color={Colors.primary} />}
            title="Cloud Backup"
            description="Secure, encrypted backup of your passwords in the cloud."
          />
          
          <PremiumFeature 
            icon={<LifeBuoy size={22} color={Colors.primary} />}
            title="Priority Support"
            description="Get dedicated help when you need it."
          />
        </View>
        
        <View style={styles.comparisonContainer}>
          <Text style={styles.comparisonTitle}>Plan Comparison</Text>
          
          <View style={styles.tableHeader}>
            <Text style={styles.featureColumnHeader}>Feature</Text>
            <Text style={styles.freeColumnHeader}>Free</Text>
            <Text style={styles.premiumColumnHeader}>Premium</Text>
          </View>
          
          <View style={styles.tableRow}>
            <Text style={styles.featureColumn}>Password Storage</Text>
            <Text style={styles.freeColumn}>10</Text>
            <Text style={styles.premiumColumn}>Unlimited</Text>
          </View>
          
          <View style={styles.tableRow}>
            <Text style={styles.featureColumn}>Link Checker</Text>
            <Text style={styles.freeColumn}>Manual</Text>
            <Text style={styles.premiumColumn}>Automatic</Text>
          </View>
          
          <View style={styles.tableRow}>
            <Text style={styles.featureColumn}>Cloud Backup</Text>
            <Text style={styles.freeColumn}>-</Text>
            <Text style={styles.premiumColumn}>✓</Text>
          </View>
          
          <View style={styles.tableRow}>
            <Text style={styles.featureColumn}>Security Reports</Text>
            <Text style={styles.freeColumn}>Basic</Text>
            <Text style={styles.premiumColumn}>Detailed</Text>
          </View>
          
          <View style={styles.tableRow}>
            <Text style={styles.featureColumn}>Priority Support</Text>
            <Text style={styles.freeColumn}>-</Text>
            <Text style={styles.premiumColumn}>✓</Text>
          </View>
        </View>
        
        <Text style={styles.legalText}>
          By upgrading, you agree to our Terms of Service and Privacy Policy. 
          You can cancel your subscription anytime through your account settings.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scrollView: {
    flex: 1,
  },
  backButton: {
    marginLeft: 8,
  },
  headerContainer: {
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 40,
  },
  crownContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.backgroundSecondary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 2,
    borderColor: Colors.warning,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 12,
    textAlign: 'center',
    fontFamily: 'PlusJakartaSans-Bold',
  },
  subtitle: {
    fontSize: 16,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
    fontFamily: 'PlusJakartaSans-Regular',
  },
  pricingContainer: {
    backgroundColor: Colors.cardBackground,
    borderRadius: 16,
    padding: 24,
    marginHorizontal: 16,
    marginBottom: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  currency: {
    fontSize: 24,
    fontWeight: '700',
    color: Colors.text,
    marginTop: 4,
    fontFamily: 'PlusJakartaSans-Bold',
  },
  price: {
    fontSize: 48,
    fontWeight: '700',
    color: Colors.text,
    lineHeight: 56,
    fontFamily: 'PlusJakartaSans-Bold',
  },
  periodContainer: {
    marginTop: 8,
    marginLeft: 4,
  },
  periodText: {
    fontSize: 16,
    color: Colors.textSecondary,
    marginBottom: 4,
    fontFamily: 'PlusJakartaSans-Regular',
  },
  saveBadge: {
    backgroundColor: Colors.warning + '20',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: Colors.warning,
  },
  saveText: {
    color: Colors.warning,
    fontSize: 12,
    fontWeight: '600',
    fontFamily: 'PlusJakartaSans-SemiBold',
  },
  annualPrice: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginBottom: 24,
    fontFamily: 'PlusJakartaSans-Regular',
  },
  upgradeButton: {
    backgroundColor: Colors.warning,
    paddingVertical: 14,
    borderRadius: 8,
    width: '100%',
    alignItems: 'center',
    marginBottom: 16,
  },
  upgradeButtonText: {
    color: Colors.background,
    fontSize: 16,
    fontWeight: '600',
    fontFamily: 'PlusJakartaSans-SemiBold',
  },
  guaranteeText: {
    fontSize: 14,
    color: Colors.textSecondary,
    fontFamily: 'PlusJakartaSans-Regular',
  },
  featuresContainer: {
    marginHorizontal: 16,
    marginBottom: 24,
  },
  featuresTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 16,
    fontFamily: 'PlusJakartaSans-SemiBold',
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.cardBackground,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  featureIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.backgroundSecondary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  featureContent: {
    flex: 1,
  },
  featureTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 4,
    fontFamily: 'PlusJakartaSans-SemiBold',
  },
  featureDescription: {
    fontSize: 14,
    color: Colors.textSecondary,
    fontFamily: 'PlusJakartaSans-Regular',
  },
  comparisonContainer: {
    marginHorizontal: 16,
    marginBottom: 24,
  },
  comparisonTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 16,
    fontFamily: 'PlusJakartaSans-SemiBold',
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: Colors.backgroundSecondary,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  featureColumnHeader: {
    flex: 2,
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text,
    fontFamily: 'PlusJakartaSans-SemiBold',
  },
  freeColumnHeader: {
    flex: 1,
    textAlign: 'center',
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textSecondary,
    fontFamily: 'PlusJakartaSans-SemiBold',
  },
  premiumColumnHeader: {
    flex: 1,
    textAlign: 'center',
    fontSize: 14,
    fontWeight: '600',
    color: Colors.warning,
    fontFamily: 'PlusJakartaSans-SemiBold',
  },
  tableRow: {
    flexDirection: 'row',
    backgroundColor: Colors.cardBackground,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: Colors.border,
  },
  featureColumn: {
    flex: 2,
    fontSize: 14,
    color: Colors.text,
    fontFamily: 'PlusJakartaSans-Regular',
  },
  freeColumn: {
    flex: 1,
    textAlign: 'center',
    fontSize: 14,
    color: Colors.textSecondary,
    fontFamily: 'PlusJakartaSans-Regular',
  },
  premiumColumn: {
    flex: 1,
    textAlign: 'center',
    fontSize: 14,
    color: Colors.success,
    fontFamily: 'PlusJakartaSans-Medium',
  },
  legalText: {
    fontSize: 12,
    color: Colors.gray,
    marginHorizontal: 16,
    marginBottom: 40,
    textAlign: 'center',
    lineHeight: 18,
    fontFamily: 'PlusJakartaSans-Regular',
  },
});