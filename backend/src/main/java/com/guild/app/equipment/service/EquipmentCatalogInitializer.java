package com.guild.app.equipment.service;

import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

@Component
@Profile("!test")
public record EquipmentCatalogInitializer(EquipmentService service) implements ApplicationRunner {
    @Override
    public void run(ApplicationArguments args) throws Exception {
        service.initializeCatalog();
    }
}
