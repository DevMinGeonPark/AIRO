package com.heptivision.airo.core.security

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

interface SecretStore {
    fun read(key: String): String?
    fun write(key: String, value: String?)
}

/** Tokens and PKCE verifiers are encrypted; neither logs nor Android backups contain them. */
class SessionVault(context: Context) : SecretStore {
    private val prefs = context.getSharedPreferences("airo_secure", Context.MODE_PRIVATE)
    private val alias = "airo_session_aes_v1"
    private fun key(): SecretKey {
        val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (store.getKey(alias, null) as? SecretKey)?.let { return it }
        return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").apply {
            init(KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256).build())
        }.generateKey()
    }
    @Synchronized override fun read(key: String): String? {
        val encrypted = prefs.getString(key, null) ?: return null
        return try {
            val parts = encrypted.split(":", limit = 2)
            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, Base64.decode(parts[0], Base64.NO_WRAP)))
            cipher.updateAAD(key.toByteArray())
            cipher.doFinal(Base64.decode(parts[1], Base64.NO_WRAP)).toString(Charsets.UTF_8)
        } catch (_: Exception) { prefs.edit().remove(key).commit(); null }
    }
    @Synchronized override fun write(key: String, value: String?) {
        if (value == null) { check(prefs.edit().remove(key).commit()); return }
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, key())
        cipher.updateAAD(key.toByteArray())
        val iv = Base64.encodeToString(cipher.iv, Base64.NO_WRAP)
        val data = Base64.encodeToString(cipher.doFinal(value.toByteArray()), Base64.NO_WRAP)
        check(prefs.edit().putString(key, "$iv:$data").commit()) { "로그인 정보를 안전하게 저장하지 못했습니다." }
    }
}
