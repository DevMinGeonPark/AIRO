plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
    id("org.jetbrains.kotlin.plugin.serialization")
}

val airoBaseUrl = providers.gradleProperty("airoBaseUrl").orElse("https://airo.dev-heptivision.com").get().trimEnd('/')
require(airoBaseUrl.startsWith("https://") || airoBaseUrl.startsWith("http://10.0.2.2:") || airoBaseUrl.startsWith("http://127.0.0.1:")) {
    "Use HTTPS for AIRO; local emulator development may use http://10.0.2.2:PORT."
}
require(!airoBaseUrl.contains('"') && !airoBaseUrl.contains('\\') && !airoBaseUrl.contains('\n'))

android {
    namespace = "com.heptivision.airo"
    compileSdk = 36
    defaultConfig {
        applicationId = "com.heptivision.airo"
        minSdk = 26
        targetSdk = 36
        versionCode = 11
        versionName = "0.3.8"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        buildConfigField("String", "API_BASE_URL", "\"$airoBaseUrl\"")
    }
    flavorDimensions += "environment"
    productFlavors {
        create("cloud") {
            dimension = "environment"
            buildConfigField("boolean", "DEMO", "false")
            resValue("string", "app_name", "AIRO")
        }
        create("demo") {
            dimension = "environment"
            applicationIdSuffix = ".demo"
            versionNameSuffix = "-demo"
            buildConfigField("boolean", "DEMO", "true")
            resValue("string", "app_name", "AIRO Demo")
        }
    }
    buildTypes {
        release {
            isMinifyEnabled = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    buildFeatures { compose = true; buildConfig = true }
    packaging { resources.excludes += "/META-INF/{AL2.0,LGPL2.1}" }
}

kotlin { compilerOptions { jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17) } }

dependencies {
    val composeBom = platform("androidx.compose:compose-bom:2025.10.01")
    implementation(composeBom)
    androidTestImplementation(composeBom)
    implementation("androidx.core:core-ktx:1.17.0")
    implementation("androidx.activity:activity-compose:1.11.0")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.9.4")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.9.4")
    implementation("androidx.navigation:navigation-compose:2.9.5")
    implementation("androidx.browser:browser:1.9.0")
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material-icons-extended")
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.9.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.10.2")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("org.maplibre.gl:android-sdk:13.6.1")
    debugImplementation("androidx.compose.ui:ui-tooling")
    debugImplementation("androidx.compose.ui:ui-test-manifest")
    testImplementation("junit:junit:4.13.2")
    testImplementation("com.squareup.okhttp3:mockwebserver:4.12.0")
    testImplementation("org.jetbrains.kotlinx:kotlinx-coroutines-test:1.10.2")
    androidTestImplementation("androidx.test.ext:junit:1.3.0")
    androidTestImplementation("androidx.test:runner:1.7.0")
    androidTestImplementation("androidx.compose.ui:ui-test-junit4")
    androidTestImplementation("androidx.test.uiautomator:uiautomator:2.3.0")
}
