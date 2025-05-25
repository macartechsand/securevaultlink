import React from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { X, Crown } from 'lucide-react-native';
import Colors from '@/constants/Colors';

interface PremiumFeatureModalProps {
  visible: boolean;
  onClose: () => void;
  featureTitle: string;
  featureDescription: string;
}

export default function PremiumFeatureModal({
  visible,
  onClose,
  featureTitle,
  featureDescription,
}: PremiumFeatureModalProps) {
  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.centeredView}>
        <View style={styles.modalView}>
          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <X size={24} color={Colors.text} />
          </TouchableOpacity>
          
          <View style={styles.premiumIcon}>
            <Crown size={32} color={Colors.warning} fill={Colors.warning} />
          </View>
          
          <Text style={styles.title}>Premium Feature</Text>
          <Text style={styles.featureTitle}>{featureTitle}</Text>
          <Text style={styles.description}>{featureDescription}</Text>
          
          <View style={styles.benefitsContainer}>
            <Text style={styles.benefitsTitle}>Premium Benefits:</Text>
            <View style={styles.benefitItem}>
              <View style={styles.bulletPoint} />
              <Text style={styles.benefitText}>Unlimited password storage</Text>
            </View>
            <View style={styles.benefitItem}>
              <View style={styles.bulletPoint} />
              <Text style={styles.benefitText}>Automatic link verification</Text>
            </View>
            <View style={styles.benefitItem}>
              <View style={styles.bulletPoint} />
              <Text style={styles.benefitText}>Cloud backups with encryption</Text>
            </View>
            <View style={styles.benefitItem}>
              <View style={styles.bulletPoint} />
              <Text style={styles.benefitText}>Detailed security reports</Text>
            </View>
          </View>
          
          <TouchableOpacity style={styles.upgradeButton} onPress={onClose}>
            <Text style={styles.upgradeButtonText}>Upgrade to Premium</Text>
          </TouchableOpacity>
          
          <TouchableOpacity onPress={onClose}>
            <Text style={styles.cancelText}>Not Now</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  centeredView: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.overlay,
  },
  modalView: {
    width: '85%',
    backgroundColor: Colors.cardBackground,
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  closeButton: {
    position: 'absolute',
    right: 16,
    top: 16,
    zIndex: 1,
  },
  premiumIcon: {
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
    color: Colors.warning,
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 8,
  },
  featureTitle: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
    textAlign: 'center',
  },
  description: {
    color: Colors.textSecondary,
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 24,
  },
  benefitsContainer: {
    alignSelf: 'stretch',
    marginBottom: 24,
  },
  benefitsTitle: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  benefitItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  bulletPoint: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.warning,
    marginRight: 8,
  },
  benefitText: {
    color: Colors.textSecondary,
    fontSize: 14,
  },
  upgradeButton: {
    backgroundColor: Colors.warning,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    width: '100%',
    alignItems: 'center',
    marginBottom: 16,
  },
  upgradeButtonText: {
    color: Colors.background,
    fontSize: 16,
    fontWeight: '600',
  },
  cancelText: {
    color: Colors.textSecondary,
    fontSize: 14,
  },
});