import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, FlatList, TouchableOpacity, TextInput, ActivityIndicator } from 'react-native';
import { Plus, Search, SlidersHorizontal, Star, Lock } from 'lucide-react-native';
import { router } from 'expo-router';
import Colors from '@/constants/Colors';
import PasswordItem from '@/components/PasswordItem';
import { usePasswordManager } from '@/hooks/usePasswordManager';
import PremiumFeatureModal from '@/components/PremiumFeatureModal';

export default function PasswordsScreen() {
  const { passwords, loading, userPlan } = usePasswordManager();
  const [searchQuery, setSearchQuery] = useState('');
  const [showPremiumModal, setShowPremiumModal] = useState(false);
  const [filteredPasswords, setFilteredPasswords] = useState(passwords);
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);

  useEffect(() => {
    // Filter passwords based on search query and favorites filter
    const filtered = passwords.filter(password => {
      const matchesSearch = 
        password.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
        password.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (password.website && password.website.toLowerCase().includes(searchQuery.toLowerCase()));
      
      if (showFavoritesOnly) {
        return matchesSearch && password.favorite;
      }
      
      return matchesSearch;
    });
    
    setFilteredPasswords(filtered);
  }, [passwords, searchQuery, showFavoritesOnly]);

  const handleAddPassword = () => {
    if (userPlan === 'free' && passwords.length >= 10) {
      setShowPremiumModal(true);
    } else {
      router.push('/passwords/add');
    }
  };

  const toggleFavoritesFilter = () => {
    setShowFavoritesOnly(!showFavoritesOnly);
  };

  const renderEmptyList = () => {
    if (loading) return <ActivityIndicator size="large" color={Colors.primary} style={styles.loader} />;
    
    if (searchQuery && filteredPasswords.length === 0) {
      return (
        <View style={styles.emptyContainer}>
          <Search size={48} color={Colors.gray} />
          <Text style={styles.emptyTitle}>No matches found</Text>
          <Text style={styles.emptyText}>Try a different search term</Text>
        </View>
      );
    }
    
    return (
      <View style={styles.emptyContainer}>
        <Lock size={48} color={Colors.gray} />
        <Text style={styles.emptyTitle}>No passwords yet</Text>
        <Text style={styles.emptyText}>Add your first password to get started</Text>
        <TouchableOpacity 
          style={styles.emptyButton}
          onPress={handleAddPassword}
        >
          <Text style={styles.emptyButtonText}>Add Password</Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.searchContainer}>
        <View style={styles.searchInputContainer}>
          <Search size={20} color={Colors.gray} />
          <TextInput 
            style={styles.searchInput}
            placeholder="Search passwords..."
            placeholderTextColor={Colors.gray}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>
        
        <TouchableOpacity 
          style={[styles.filterButton, showFavoritesOnly && styles.filterButtonActive]}
          onPress={toggleFavoritesFilter}
        >
          <Star size={20} color={showFavoritesOnly ? Colors.warning : Colors.gray} />
        </TouchableOpacity>
        
        <TouchableOpacity style={styles.filterButton}>
          <SlidersHorizontal size={20} color={Colors.gray} />
        </TouchableOpacity>
      </View>
      
      {userPlan === 'free' && (
        <View style={styles.limitContainer}>
          <Text style={styles.limitText}>
            {passwords.length}/10 passwords used in free plan
          </Text>
          <TouchableOpacity 
            style={styles.upgradeButton}
            onPress={() => router.push('/modal/premium')}
          >
            <Text style={styles.upgradeButtonText}>Upgrade</Text>
          </TouchableOpacity>
        </View>
      )}
      
      <FlatList
        data={filteredPasswords}
        renderItem={({ item }) => <PasswordItem password={item} />}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={renderEmptyList}
      />
      
      <TouchableOpacity style={styles.fab} onPress={handleAddPassword}>
        <Plus size={24} color={Colors.text} />
      </TouchableOpacity>
      
      <PremiumFeatureModal
        visible={showPremiumModal}
        onClose={() => setShowPremiumModal(false)}
        featureTitle="Unlimited Passwords"
        featureDescription="Free plan is limited to 10 passwords. Upgrade to Premium for unlimited password storage."
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  searchContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignItems: 'center',
  },
  searchInputContainer: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: Colors.cardBackground,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  searchInput: {
    flex: 1,
    marginLeft: 8,
    fontSize: 16,
    color: Colors.text,
    height: 40,
    fontFamily: 'PlusJakartaSans-Regular',
  },
  filterButton: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: Colors.cardBackground,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  filterButtonActive: {
    backgroundColor: Colors.backgroundSecondary,
    borderColor: Colors.warning,
  },
  limitContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.backgroundSecondary,
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginBottom: 8,
  },
  limitText: {
    color: Colors.textSecondary,
    fontSize: 14,
    fontFamily: 'PlusJakartaSans-Regular',
  },
  upgradeButton: {
    backgroundColor: Colors.warning,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 4,
  },
  upgradeButtonText: {
    color: Colors.background,
    fontWeight: '600',
    fontSize: 12,
    fontFamily: 'PlusJakartaSans-SemiBold',
  },
  list: {
    padding: 16,
    paddingBottom: 80,
  },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 5,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 4,
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
    marginBottom: 24,
    textAlign: 'center',
    fontFamily: 'PlusJakartaSans-Regular',
  },
  emptyButton: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  emptyButtonText: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: '600',
    fontFamily: 'PlusJakartaSans-SemiBold',
  },
  loader: {
    marginTop: 40,
  },
});