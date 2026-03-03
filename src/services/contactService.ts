import * as Contacts from 'expo-contacts';
import * as Crypto from 'expo-crypto';
import api from './api';
import type { ContactMatchUser, MatchContactsResponse } from '../types/api';

/**
 * Normalize a phone number to E.164 format.
 * Strips whitespace, dashes, parentheses, and dots.
 * Converts Korean local 010 numbers to +82 international format.
 */
export function normalizePhoneNumber(phone: string): string {
  // Strip all non-digit characters except leading '+'
  const stripped = phone.replace(/[^\d+]/g, '');

  // Korean local format: 010XXXXXXXX -> +8210XXXXXXXX
  if (stripped.startsWith('010') && stripped.length === 11) {
    return '+82' + stripped.slice(1);
  }

  // Already has country code prefix
  if (stripped.startsWith('+')) {
    return stripped;
  }

  // Korean format without leading zero: 1012345678
  if (stripped.startsWith('10') && stripped.length === 10) {
    return '+82' + stripped;
  }

  // Fallback: assume Korean number if 11 digits starting with 0
  if (stripped.startsWith('0') && stripped.length === 11) {
    return '+82' + stripped.slice(1);
  }

  return stripped;
}

/**
 * Normalize and SHA-256 hash a phone number.
 */
export async function hashPhoneNumber(phone: string): Promise<string> {
  const normalized = normalizePhoneNumber(phone);
  return Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    normalized,
  );
}

export const contactService = {
  /**
   * Check whether the current user has registered a phone hash.
   */
  async getPhoneHashStatus(): Promise<boolean> {
    const data = await api.get<{ has_phone_hash: boolean }>('/contacts/phone-hash-status');
    return data.has_phone_hash;
  },

  /**
   * Register the user's phone number as a SHA-256 hash on the server.
   */
  async registerPhoneNumber(phoneNumber: string): Promise<void> {
    const hash = await hashPhoneNumber(phoneNumber);
    await api.put('/contacts/phone-hash', { phone_hash: hash });
  },

  /**
   * Remove the user's phone hash from the server.
   */
  async removePhoneHash(): Promise<void> {
    await api.delete('/contacts/phone-hash');
  },

  /**
   * Request device contacts permission.
   */
  async requestPermission(): Promise<boolean> {
    const { status } = await Contacts.requestPermissionsAsync();
    return status === 'granted';
  },

  /**
   * Check current contacts permission status.
   */
  async checkPermission(): Promise<boolean> {
    const { status } = await Contacts.getPermissionsAsync();
    return status === 'granted';
  },

  /**
   * Read device contacts, hash all phone numbers, and match against the server.
   * Returns an array of RUNVS users whose phone hashes matched.
   */
  async findFriendsFromContacts(): Promise<ContactMatchUser[]> {
    const { data } = await Contacts.getContactsAsync({
      fields: [Contacts.Fields.PhoneNumbers],
    });

    // Collect all phone numbers from contacts
    const phoneNumbers: string[] = [];
    for (const contact of data) {
      if (contact.phoneNumbers) {
        for (const entry of contact.phoneNumbers) {
          if (entry.number) {
            phoneNumbers.push(entry.number);
          }
        }
      }
    }

    if (phoneNumbers.length === 0) {
      return [];
    }

    // Hash all phone numbers and deduplicate
    const hashSet = new Set<string>();
    const hashPromises = phoneNumbers.map((num) => hashPhoneNumber(num));
    const hashes = await Promise.all(hashPromises);

    for (const hash of hashes) {
      hashSet.add(hash);
    }

    const uniqueHashes = Array.from(hashSet);

    // Send hashes to server for matching
    const response = await api.post<MatchContactsResponse>(
      '/contacts/match',
      { contact_hashes: uniqueHashes },
    );

    return response.matches;
  },
};
